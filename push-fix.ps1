Set-Location "C:\Users\Maldanis\Desktop\controlarapp-main"
git add "codex-publish-controlarapp\app\settings\plans.tsx"
git add "codex-publish-controlarapp\app\settings\subscription.tsx"
git add "codex-publish-controlarapp\components\SubscriptionBlocker.tsx"
git add "server\api\apple.js"
git status --short
git commit -m "fix: corrige travamento em tela Meu Plano apos assinatura"
git push origin main
