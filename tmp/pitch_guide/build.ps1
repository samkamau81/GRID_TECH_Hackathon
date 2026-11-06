$root='S:\OneDrive\Desktop\GRID_Hackathon\Claude Code Setup'
$out="$root\output\pdf\Peak_Power_Investor_Pitch_and_Judging_Guide.pdf"
Remove-Item $out -ErrorAction SilentlyContinue
$url="file:///S:/OneDrive/Desktop/GRID_Hackathon/Claude%20Code%20Setup/tmp/pitch_guide/guide.html"
$a=@('--headless=new','--disable-gpu','--no-pdf-header-footer',"--user-data-dir=`"$env:TEMP\edge_pp_profile`"","--print-to-pdf=`"$out`"","`"$url`"")
$p=Start-Process -FilePath "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList $a -Wait -PassThru -NoNewWindow 2>$null
Get-Item $out | Select-Object Length,LastWriteTime
