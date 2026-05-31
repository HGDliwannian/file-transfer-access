// AIGC START — NSPasteboard 写入文件引用，供访达粘贴
import Cocoa

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else { exit(2) }

var urls: [NSURL] = []
for p in args {
  let url = URL(fileURLWithPath: (p as NSString).expandingTildeInPath)
  var isDir: ObjCBool = false
  guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue else {
    fputs("missing file: \(p)\n", stderr)
    exit(3)
  }
  urls.append(url as NSURL)
}

let pb = NSPasteboard.general
pb.clearContents()
guard pb.writeObjects(urls) else {
  fputs("writeObjects failed\n", stderr)
  exit(1)
}
exit(0)
// AIGC END
