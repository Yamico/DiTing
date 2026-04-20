Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName))
WshShell.Run "uv run pythonw scripts\start_desktop.py --silent", 0, False
Set WshShell = Nothing
