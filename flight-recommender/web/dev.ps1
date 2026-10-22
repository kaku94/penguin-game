# 프로젝트 전용 포터블 Node(../.tools)로 개발 서버를 실행한다. 시스템에 Node가 있으면 npm run dev 로도 된다.
$root = Split-Path $PSScriptRoot
$node = Get-ChildItem "$root\.tools" -Directory -Filter "node-*" | Select-Object -First 1
if ($node) {
    $env:Path = "$($node.FullName);$env:Path"
}
Set-Location $PSScriptRoot
npm run dev
