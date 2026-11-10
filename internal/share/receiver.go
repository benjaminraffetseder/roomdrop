package share

import (
	"fmt"
	"html/template"
	"net/http"
)

var receiver = template.Must(template.New("receiver").Funcs(template.FuncMap{
	"size": func(size int64) string {
		if size < 1000 {
			return fmt.Sprintf("%d B", size)
		}
		value, unit := float64(size), "B"
		for _, next := range []string{"KB", "MB", "GB", "TB"} {
			value /= 1000
			unit = next
			if value < 1000 {
				break
			}
		}
		return fmt.Sprintf("%.1f %s", value, unit)
	},
}).Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoomDrop — Download files</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f8f3;color:#26382e;font:15px/1.6 system-ui,-apple-system,sans-serif;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:460px}.brand{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:750;letter-spacing:-.8px}.mark{display:block;width:36px;height:36px;flex-shrink:0}h1{font-size:28px;line-height:1.3;letter-spacing:-.6px;font-weight:550;margin:28px 0 16px}p{color:#737c71;margin:0 0 24px}.card{background:#fff;border:1px solid #dfe3d8;border-radius:18px;padding:22px;margin:28px 0}ul{padding:0;list-style:none;max-height:250px;overflow:auto}li{display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #eef0e9}li:last-child{border:0}.file{min-width:0;flex:1;overflow-wrap:anywhere}small{color:#818878;white-space:nowrap}button{width:100%;border:0;border-radius:11px;background:#446b4e;color:white;font:600 15px system-ui;padding:15px;cursor:pointer}button:hover{background:#34553c}button:active{transform:scale(.98)}button:focus-visible{outline:3px solid #9eb69c;outline-offset:3px}.note{font-size:12px;text-align:center;margin:15px 0 0}.footer{margin:28px 0;font-size:12px;text-align:center;color:#858c7f}.expiry{border-top:1px solid #e3e7dc;padding-top:18px;font-size:13px}a{color:inherit}
label{display:block;font-weight:600;margin:18px 0 6px}input{width:100%;border:1px solid #dfe3d8;border-radius:9px;background:#fff;color:inherit;font:inherit;padding:11px 12px;margin-bottom:8px}input:focus-visible{outline:3px solid #9eb69c;outline-offset:2px}.password-help{font-size:12px;margin:0 0 18px}.error{color:#9b3434;font-size:13px;margin:0 0 18px}
</style></head><body><main><div class="brand"><svg class="mark" width="36" height="36" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#e1e9d9"/>
  <g fill="none" stroke="#3f6247" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M26 50H20Q14 50 14 44V20Q14 14 20 14H44Q50 14 50 20V44Q50 50 44 50H38"/>
    <path d="M21 27Q32 17 43 27M26 33Q32 27.5 38 33"/>
  </g>
  <circle cx="32" cy="39" r="2.25" fill="#3f6247"/>
</svg>RoomDrop</div>
<h1>Download files</h1>
<div class="card"><ul>{{range .Session.Items}}<li><span aria-hidden="true">{{if .Folder}}▧{{else}}↳{{end}}</span><span class="file">{{.Name}}</span><small>{{size .Size}}</small></li>{{end}}</ul>
<form action="{{.Path}}/download" method="post">{{if .Session.PasswordProtected}}<label for="password">Download password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required aria-describedby="password-help{{if .Error}} password-error{{end}}"{{if .Error}} aria-invalid="true" autofocus{{end}}><p id="password-help" class="password-help">This download is password protected. Ask the sender for the password.</p>{{end}}{{if .Error}}<p id="password-error" class="error" role="alert">{{.Error}}</p>{{end}}<button type="submit">Download{{if .Archive}} ZIP{{end}} · {{size .Session.Size}} ↓</button></form>
{{if .Session.Once}}<p class="note">Link expires after this download.</p>{{end}}</div>
<p class="expiry">Available until {{.Expires}} on the sender's clock.<br>Keep both devices on the same local network.</p><div class="footer">Local HTTP transfers are not encrypted. Only accept files you trust.</div></main></body></html>`))

func (s *session) render(w http.ResponseWriter, path string, status int, message string) {
	snapshot := s.snapshot()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_ = receiver.Execute(w, struct {
		Session Snapshot
		Path    string
		Archive bool
		Expires string
		Error   string
	}{snapshot, path, len(snapshot.Items) > 1 || snapshot.Items[0].Folder, snapshot.ExpiresAt.Format("15:04 MST"), message})
}
