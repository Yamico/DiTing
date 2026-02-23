Set objFSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' 获取当前脚本所在目录并设置为工作目录
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strScriptPath

' 探测常用的虚拟环境目录 (venv 或 .venv)
strPythonw = "pythonw"
If objFSO.FileExists(strScriptPath & "\venv\Scripts\pythonw.exe") Then
    strPythonw = Chr(34) & strScriptPath & "\venv\Scripts\pythonw.exe" & Chr(34)
ElseIf objFSO.FileExists(strScriptPath & "\.venv\Scripts\pythonw.exe") Then
    strPythonw = Chr(34) & strScriptPath & "\.venv\Scripts\pythonw.exe" & Chr(34)
End If

' 启动托盘程序
WshShell.Run strPythonw & " run_worker_tray.py", 0, False

Set WshShell = Nothing
Set objFSO = Nothing
