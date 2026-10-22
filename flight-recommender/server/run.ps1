# 프로젝트 전용 포터블 JDK(../.tools)로 서버를 실행한다. 시스템에 JDK 21이 있으면 ./mvnw spring-boot:run 으로도 된다.
$root = Split-Path $PSScriptRoot
$jdk = Get-ChildItem "$root\.tools" -Directory -Filter "jdk-21*" | Select-Object -First 1
if ($jdk) {
    $env:JAVA_HOME = $jdk.FullName
    $env:Path = "$($jdk.FullName)\bin;$env:Path"
}
Set-Location $PSScriptRoot
& .\mvnw.cmd -q spring-boot:run
