Set objFSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strScriptPath

strPythonw = "pythonw"
If objFSO.FileExists(strScriptPath & "\venv\Scripts\pythonw.exe") Then
    strPythonw = Chr(34) & strScriptPath & "\venv\Scripts\pythonw.exe" & Chr(34)
ElseIf objFSO.FileExists(strScriptPath & "\.venv\Scripts\pythonw.exe") Then
    strPythonw = Chr(34) & strScriptPath & "\.venv\Scripts\pythonw.exe" & Chr(34)
End If

WshShell.Run strPythonw & " run_worker_tray.py", 0, False

Set WshShell = Nothing
Set objFSO = Nothing
