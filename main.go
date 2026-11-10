package main

import (
	"context"
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed assets/roomdrop-icon.png
var trayIcon []byte

func main() {
	service := NewApp()
	app := application.New(application.Options{
		Name: "RoomDrop",
		Services: []application.Service{
			application.NewService(service),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})
	if err := configureUpdater(app); err != nil {
		log.Fatal(err)
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "RoomDrop",
		Width:            450,
		Height:           740,
		MinWidth:         450,
		MinHeight:        620,
		EnableFileDrop:   true,
		BackgroundColour: application.NewRGB(247, 248, 243),
		URL:              "/",
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		go service.dropped(event.Context().DroppedFiles())
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		service.manager.Stop()
		window.Hide()
	})

	tray := app.SystemTray.New()
	tray.SetIcon(trayIcon)
	tray.SetTooltip("RoomDrop")
	showWindow := func() {
		window.Show()
		window.UnMinimise()
		window.Focus()
	}
	tray.OnClick(showWindow)
	tray.OnDoubleClick(showWindow)

	menu := app.NewMenu()
	menu.Add("Open RoomDrop").OnClick(func(_ *application.Context) {
		showWindow()
	})
	menu.Add("Stop session").OnClick(func(_ *application.Context) {
		service.manager.Stop()
	})
	menu.Add("Check for updates…").OnClick(func(_ *application.Context) {
		go func() {
			if err := service.CheckForUpdates(context.Background()); err != nil {
				app.Logger.Error("Check for updates", "error", err)
			}
		}()
	})
	menu.AddSeparator()
	menu.Add("Quit RoomDrop").OnClick(func(_ *application.Context) {
		service.manager.Stop()
		app.Quit()
	})
	tray.SetMenu(menu)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
