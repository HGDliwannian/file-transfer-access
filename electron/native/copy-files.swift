// AIGC START
import Cocoa

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else { exit(2) }

var urls: [NSURL] = []
for p in args {
  let url = URL(fileURLWithPath: p)
  guard FileManager.default.fileExists(atPath: url.path) else { exit(3) }
  urls.append(url as NSURL)
}

let pb = NSPasteboard.general
pb.clearContents()

if urls.count == 1, let url = urls.first {
  let item = NSPasteboardItem()
  item.setString(url.absoluteString!, forType: .fileURL)
  guard pb.writeObjects([item]) else { exit(1) }
} else {
  guard pb.writeObjects(urls) else { exit(1) }
}
exit(0)
// AIGC END
