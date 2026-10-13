' Roda o rodar.cmd sem abrir janela (usado pelo Agendador de Tarefas)
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\rodar.cmd""", 0, True
