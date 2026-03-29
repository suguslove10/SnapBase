package notifications

import (
	"bytes"
	"html/template"
	"time"
)

var (
	successTemplate       = template.Must(template.New("success").Parse(successTmpl))
	failureTemplate       = template.Must(template.New("failure").Parse(failureTmpl))
	inviteTemplate        = template.Must(template.New("invite").Parse(inviteTmpl))
	passwordResetTemplate = template.Must(template.New("password_reset").Parse(passwordResetTmpl))
)

// BackupEmailData holds template data for backup emails.
type BackupEmailData struct {
	ConnectionName string
	ConnectionType string
	Size           string
	Duration       string
	Timestamp      string
	DashboardURL   string
	ErrorMessage   string
}

// InviteEmailData holds template data for invite emails.
type InviteEmailData struct {
	OrgName     string
	InviterName string
	Role        string
	AcceptURL   string
}

func renderBackupSuccess(n BackupNotification, dashboardURL string) (string, error) {
	data := BackupEmailData{
		ConnectionName: n.ConnectionName,
		ConnectionType: n.ConnectionType,
		Size:           formatSize(n.SizeBytes),
		Duration:       n.Duration.Round(time.Second).String(),
		Timestamp:      n.Timestamp.Format("Jan 2, 2006 at 15:04 UTC"),
		DashboardURL:   dashboardURL,
	}
	var buf bytes.Buffer
	if err := successTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderBackupFailure(n BackupNotification, dashboardURL string) (string, error) {
	data := BackupEmailData{
		ConnectionName: n.ConnectionName,
		ConnectionType: n.ConnectionType,
		ErrorMessage:   n.ErrorMessage,
		Timestamp:      n.Timestamp.Format("Jan 2, 2006 at 15:04 UTC"),
		DashboardURL:   dashboardURL,
	}
	var buf bytes.Buffer
	if err := failureTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// RenderInviteEmail renders the HTML invite email body.
func RenderInviteEmail(data InviteEmailData) (string, error) {
	var buf bytes.Buffer
	if err := inviteTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// PasswordResetEmailData holds template data for password reset emails.
type PasswordResetEmailData struct {
	ResetURL string
}

// RenderPasswordResetEmail renders the HTML password reset email body.
func RenderPasswordResetEmail(data PasswordResetEmailData) (string, error) {
	var buf bytes.Buffer
	if err := passwordResetTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

const passwordResetTmpl = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Reset your SnapBase password</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
        </td>
      </tr>
      <tr>
        <td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <div style="width:60px;height:60px;background:rgba(0,180,255,0.12);border-radius:50%;display:inline-block;text-align:center;line-height:60px;font-size:28px;">&#128274;</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Reset your password</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Someone requested a password reset for your SnapBase account.<br>Click the button below to set a new password.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <a href="{{.ResetURL}}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Reset Password</a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">This link expires in <strong style="color:#94a3b8;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;">SnapBase &mdash; Database backup made simple.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

const successTmpl = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Backup Successful</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
        </td>
      </tr>
      <tr>
        <td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <div style="width:60px;height:60px;background:rgba(0,255,136,0.12);border-radius:50%;display:inline-block;text-align:center;line-height:60px;font-size:28px;color:#00ff88;">&#10003;</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Backup Successful</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <p style="margin:0;font-size:14px;color:#64748b;">{{.ConnectionName}} completed successfully</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="48%" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Type</div>
                      <div style="font-size:16px;font-weight:600;color:#00b4ff;">{{.ConnectionType}}</div>
                    </td>
                    <td width="4%"></td>
                    <td width="48%" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Size</div>
                      <div style="font-size:16px;font-weight:600;color:#00f5d4;">{{.Size}}</div>
                    </td>
                  </tr>
                  <tr><td colspan="3" style="height:12px;"></td></tr>
                  <tr>
                    <td width="48%" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Duration</div>
                      <div style="font-size:16px;font-weight:600;color:#ffffff;">{{.Duration}}</div>
                    </td>
                    <td width="4%"></td>
                    <td width="48%" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Time</div>
                      <div style="font-size:16px;font-weight:600;color:#ffffff;">{{.Timestamp}}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="{{.DashboardURL}}" style="display:inline-block;background:linear-gradient(135deg,#00b4ff,#00f5d4);color:#0a0f1e;font-weight:700;font-size:14px;padding:12px 32px;border-radius:10px;text-decoration:none;">View Dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;">You're receiving this because backup notifications are enabled for your account.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

const failureTmpl = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Backup Failed</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
        </td>
      </tr>
      <tr>
        <td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <div style="width:60px;height:60px;background:rgba(239,68,68,0.12);border-radius:50%;display:inline-block;text-align:center;line-height:60px;font-size:28px;color:#ef4444;">&#10007;</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Backup Failed</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <p style="margin:0;font-size:14px;color:#64748b;">{{.ConnectionName}} &middot; {{.ConnectionType}}</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:32px;">
                <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.20);border-radius:10px;padding:16px 20px;">
                  <div style="font-size:11px;color:#f87171;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;font-weight:600;">Error</div>
                  <div style="font-size:14px;color:#fca5a5;line-height:1.5;">{{.ErrorMessage}}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Time</div>
                      <div style="font-size:15px;font-weight:600;color:#ffffff;">{{.Timestamp}}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="{{.DashboardURL}}" style="display:inline-block;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.30);color:#f87171;font-weight:700;font-size:14px;padding:12px 32px;border-radius:10px;text-decoration:none;">View Details</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;">You're receiving this because backup notifications are enabled for your account.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

const inviteTmpl = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're invited to {{.OrgName}}</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
        </td>
      </tr>
      <tr>
        <td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <div style="width:60px;height:60px;background:rgba(0,180,255,0.12);border-radius:50%;display:inline-block;text-align:center;line-height:60px;font-size:28px;">&#9993;</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">You're invited!</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;"><strong style="color:#94a3b8;">{{.InviterName}}</strong> invited you to join <strong style="color:#94a3b8;">{{.OrgName}}</strong> on SnapBase</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:rgba(0,180,255,0.10);border:1px solid rgba(0,180,255,0.20);border-radius:20px;padding:6px 16px;">
                      <span style="font-size:12px;font-weight:600;color:#00b4ff;text-transform:uppercase;letter-spacing:0.08em;">{{.Role}}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="{{.AcceptURL}}" style="display:inline-block;background:linear-gradient(135deg,#00b4ff,#00f5d4);color:#0a0f1e;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Accept Invitation</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:20px;">
                <p style="margin:0;font-size:12px;color:#475569;">This invitation expires in 7 days.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
