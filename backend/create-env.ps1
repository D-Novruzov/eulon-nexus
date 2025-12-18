# PowerShell script to create .env file in backend directory

$envContent = @"
# GitHub OAuth Configuration
# Get these from: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# OAuth Callback URL
GITHUB_CALLBACK_URL=http://localhost:4000/auth/github/callback

# Frontend origin (for CORS)
FRONTEND_ORIGIN=http://localhost:5173

# Server port
PORT=4000
"@

$envPath = Join-Path $PSScriptRoot ".env"

if (Test-Path $envPath) {
    Write-Host ".env file already exists at: $envPath" -ForegroundColor Yellow
    Write-Host "Please edit it manually with your GitHub OAuth credentials." -ForegroundColor Yellow
} else {
    $envContent | Out-File -FilePath $envPath -Encoding utf8
    Write-Host "Created .env file at: $envPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: Edit this file and replace the placeholder values with your actual GitHub OAuth credentials!" -ForegroundColor Red
    Write-Host "See backend/GITHUB_OAUTH_SETUP.md for instructions." -ForegroundColor Cyan
}

