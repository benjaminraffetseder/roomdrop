package share

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type Item struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Folder bool   `json:"folder"`
}

func Inspect(paths []string) ([]Item, error) {
	items := make([]Item, 0, len(paths))
	for _, path := range paths {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return nil, errors.New("Could not read the selected path.")
		}
		info, err := os.Lstat(absolute)
		if err != nil {
			return nil, fmt.Errorf("Could not read %q. Check that it still exists and you can open it.", filepath.Base(path))
		}
		if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return nil, fmt.Errorf("%q is a link or special file. Choose the original file instead.", info.Name())
		}
		if info.Name() == "." || info.Name() == ".." || strings.ContainsAny(info.Name(), `/\\`) {
			return nil, errors.New("Choose a file or folder inside the volume, with no slashes in its name.")
		}
		size := info.Size()
		if info.IsDir() {
			size = 0
		}
		items = append(items, Item{Path: absolute, Name: info.Name(), Size: size, Folder: info.IsDir()})
	}
	return items, nil
}

type payload struct {
	file      *os.File
	name      string
	size      int64
	temporary string
	items     []Item
}

func (p *payload) close() {
	_ = p.file.Close()
	if p.temporary != "" {
		_ = os.Remove(p.temporary)
	}
}

func prepare(ctx context.Context, paths []string) (*payload, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	items, err := Inspect(paths)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errors.New("Choose at least one file or folder to share.")
	}
	if len(items) == 1 && !items[0].Folder {
		file, err := os.Open(items[0].Path)
		if err != nil {
			return nil, fmt.Errorf("Could not open %q.", items[0].Name)
		}
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			_ = file.Close()
			return nil, errors.New("The selected file changed. Please select it again.")
		}
		return &payload{file: file, name: items[0].Name, size: info.Size(), items: items}, nil
	}
	file, err := os.CreateTemp("", "roomdrop-*.zip")
	if err != nil {
		return nil, errors.New("Could not create a temporary ZIP. Check your available disk space.")
	}
	p := &payload{file: file, temporary: file.Name(), name: "RoomDrop.zip", items: items}
	if len(items) == 1 {
		p.name = items[0].Name + ".zip"
	}
	writer := zip.NewWriter(file)
	used := map[string]bool{}
	for i, item := range items {
		name := item.Name
		for n := 2; used[strings.ToLower(name)]; n++ {
			ext := filepath.Ext(item.Name)
			name = fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(item.Name, ext), n, ext)
		}
		used[strings.ToLower(name)] = true
		if item.Folder {
			var size int64
			size, err = addFolder(ctx, writer, item.Path, name)
			p.items[i].Size = size
		} else {
			err = addFile(ctx, writer, item.Path, name)
		}
		if err != nil {
			_ = writer.Close()
			p.close()
			return nil, fmt.Errorf("Could not bundle %q: %w", item.Name, err)
		}
	}
	if err = writer.Close(); err != nil {
		p.close()
		return nil, errors.New("Could not finish the ZIP. Check your available disk space.")
	}
	info, err := file.Stat()
	if err != nil {
		p.close()
		return nil, errors.New("Could not read the ZIP.")
	}
	p.size = info.Size()
	return p, nil
}

func addFolder(ctx context.Context, writer *zip.Writer, path, name string) (int64, error) {
	// Prevent a directory entry swapped for a symlink during bundling from
	// escaping the explicitly selected directory.
	root, err := os.OpenRoot(path)
	if err != nil {
		return 0, err
	}
	defer root.Close()
	var size int64
	err = fs.WalkDir(root.FS(), ".", func(relative string, entry fs.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("%q is a symbolic link; choose its original files instead", relative)
		}
		if relative != "." && strings.Contains(entry.Name(), `\`) {
			return fmt.Errorf("%q contains a backslash and cannot be safely bundled", relative)
		}
		archiveName := name
		if relative != "." {
			archiveName += "/" + filepath.ToSlash(relative)
		}
		if entry.IsDir() {
			_, err := writer.Create(archiveName + "/")
			return err
		}
		file, err := root.Open(relative)
		if err != nil {
			return err
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("%q is not a regular file", relative)
		}
		if err := writeEntry(ctx, writer, file, info, archiveName); err != nil {
			return err
		}
		size += info.Size()
		return nil
	})
	return size, err
}

func addFile(ctx context.Context, writer *zip.Writer, path, name string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("selection changed to a special file")
	}
	return writeEntry(ctx, writer, file, info, name)
}

func writeEntry(ctx context.Context, writer *zip.Writer, file *os.File, info fs.FileInfo, name string) error {
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(name)
	header.Method = zip.Deflate
	entry, err := writer.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(entry, &contextReader{ctx: ctx, reader: file})
	return err
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
