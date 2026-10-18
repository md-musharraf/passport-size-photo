'use client';
import { useState } from 'react';
import { 
  FiX, FiCopy, FiCheck, FiExternalLink, FiMail, FiPhone, FiLinkedin, FiInstagram, FiTwitter 
} from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';

interface DeveloperContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeveloperContactModal({ isOpen, onClose }: DeveloperContactModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const contacts = [
    {
      id: 'whatsapp',
      name: 'WhatsApp / Phone',
      value: '6299019431',
      displayValue: '+91 6299019431',
      icon: <FaWhatsapp className="w-5 h-5 text-emerald-400" />,
      link: 'https://wa.me/916299019431',
      actionLabel: 'Chat / Call',
    },
    {
      id: 'email',
      name: 'Email Address',
      value: 'devwithmusharraf@gmail.com',
      displayValue: 'devwithmusharraf@gmail.com',
      icon: <FiMail className="w-5 h-5 text-sky-400" />,
      link: 'mailto:devwithmusharraf@gmail.com',
      actionLabel: 'Send Mail',
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      value: 'md-musharraf-dev',
      displayValue: 'md-musharraf-dev',
      icon: <FiLinkedin className="w-5 h-5 text-blue-400" />,
      link: 'https://linkedin.com/in/md-musharraf-dev',
      actionLabel: 'Connect',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      value: 'mush_a_rraf',
      displayValue: '@mush_a_rraf',
      icon: <FiInstagram className="w-5 h-5 text-pink-400" />,
      link: 'https://instagram.com/mush_a_rraf',
      actionLabel: 'Follow',
    },
    {
      id: 'twitter',
      name: 'X (Twitter)',
      value: 'Mush_a_rraf',
      displayValue: '@Mush_a_rraf',
      icon: <FiTwitter className="w-5 h-5 text-neutral-200" />,
      link: 'https://x.com/Mush_a_rraf',
      actionLabel: 'Follow',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fadeIn">
      {/* Modal Card */}
      <div className="w-full max-w-lg card-chai rounded-2xl p-6 md:p-8 relative text-foreground font-sans overflow-hidden">
        {/* Decorative subtle top hairline */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-lg border border-border bg-card-chai text-neutral-400 hover:text-foreground transition-colors flex items-center justify-center cursor-pointer z-10"
        >
          <FiX className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-6 select-text">
          <div className="mx-auto w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-foreground">
            <FiPhone className="w-5 h-5 text-foreground" />
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mt-4 text-foreground">
            Developer contact & support
          </h2>
          <p className="text-[13px] text-neutral-400 max-w-sm mx-auto mt-2">
            Need help, want to report a bug, request custom features, or inquire about license keys? Contact the developer:
          </p>
        </div>

        {/* Contacts Grid */}
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 select-text">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-card-app/30 border border-border-app/40 hover:border-accent-app/45 hover:bg-card-app/60 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-card-app/80 flex items-center justify-center border border-border-app shrink-0">
                  {contact.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-400 leading-none mb-1">
                    {contact.name}
                  </p>
                  <p className="text-[14px] font-semibold text-foreground truncate">
                    {contact.displayValue}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Copy Button */}
                <button
                  onClick={() => handleCopy(contact.value, contact.id)}
                  className="w-8 h-8 rounded-lg bg-card-chai border border-border flex items-center justify-center text-neutral-400 hover:text-foreground transition-colors cursor-pointer relative"
                  title={`Copy ${contact.name}`}
                >
                  {copiedId === contact.id ? (
                    <FiCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <FiCopy className="w-4 h-4" />
                  )}
                  {copiedId === contact.id && (
                    <span className="absolute -top-8 bg-neutral-900 text-white text-[10px] px-1.5 py-0.5 rounded border border-neutral-800 font-medium whitespace-nowrap animate-bounce">
                      Copied!
                    </span>
                  )}
                </button>

                {/* External Link Button */}
                <a
                  href={contact.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white hover:text-black border border-white/20 text-foreground flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
                >
                  <span>{contact.actionLabel}</span>
                  <FiExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center select-none">
          <p className="text-[10px] text-text-secondary/60 font-semibold tracking-wide">
            Precision ID Studio • Handcrafted by Md Musharraf
          </p>
        </div>
      </div>
    </div>
  );
}
