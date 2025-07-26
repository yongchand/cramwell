import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Twitter, Facebook, Mail, Send, MessageCircle } from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  url: string;
}

const socialLinks = [
  {
    name: "Twitter",
    icon: <Twitter className="w-5 h-5" />,
    getUrl: (url: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Facebook",
    icon: <Facebook className="w-5 h-5" />,
    getUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: "WhatsApp",
    icon: <MessageCircle className="w-5 h-5" />,
    getUrl: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}`,
  },
  {
    name: "Telegram",
    icon: <Send className="w-5 h-5" />,
    getUrl: (url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Email",
    icon: <Mail className="w-5 h-5" />,
    getUrl: (url: string) => `mailto:?subject=Check this out&body=${encodeURIComponent(url)}`,
  },
];

export function ShareDialog({ open, onClose, url }: ShareDialogProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDeviceShare = () => {
    if (navigator.share) {
      navigator.share({ title: "Cramwell Dashboard", url });
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mb-4">
          <input
            type="text"
            value={url}
            readOnly
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <Button size="icon" variant="ghost" onClick={handleCopy}>
            <Copy className="w-4 h-4" />
          </Button>
          {copied && <span className="text-xs text-uchicago-crimson ml-2">Copied!</span>}
        </div>
        <Button className="w-full mb-4" onClick={handleDeviceShare}>
          <Share2 className="w-4 h-4 mr-2" /> Share via Device
        </Button>
        <div className="grid grid-cols-3 gap-3 mb-2">
          {socialLinks.map(link => (
            <a
              key={link.name}
              href={link.getUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center bg-muted rounded-lg py-3 hover:bg-uchicago-crimson/10 transition-colors"
            >
              {link.icon}
              <span className="text-xs mt-1">{link.name}</span>
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
} 