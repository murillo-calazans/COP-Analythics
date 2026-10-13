# Cria (ou recria) a tarefa "COP - Robo de Ordens" no Agendador de Tarefas:
# roda de hora em hora, sem janela, enquanto voce estiver logado no PC.
$vbs = Join-Path $PSScriptRoot "rodar-oculto.vbs"
$acao = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours((Get-Date).Hour + 1) -RepetitionInterval (New-TimeSpan -Hours 1)
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "COP - Robo de Ordens" -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Write-Output "Tarefa criada: roda de hora em hora. Log em: $(Join-Path $PSScriptRoot 'logs\robo.log')"
