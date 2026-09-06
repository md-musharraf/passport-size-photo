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
      <div className="w-full max-w-lg bg-panel-app border border-border-app rounded-3xl p-6 md:p-8 shadow-2xl relative text-text-primary font-sans overflow-hidden">
        {/* Decorative Gradients */}
        <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-accent-app/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-lg border border-border-app bg-card-app/50 hover:bg-card-app text-text-secondary hover:text-text-primary transition-all flex items-center justify-center cursor-pointer z-10"
        >
          <FiX className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-6 select-text">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent-app to-orange-500 flex items-center justify-center shadow-lg shadow-accent-app/10">
            <FiPhone className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-[22px] font-extrabold tracking-tight mt-4 text-text-primary">
            Developer Contact & Support
          </h2>
          <p className="text-[13px] text-text-secondary max-w-sm mx-auto mt-2">
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
                  <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest leading-none mb-1">
                    {contact.name}
                  </p>
                  <p className="text-[14px] font-bold text-text-primary truncate">
                    {contact.displayValue}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Copy Button */}
                <button
                  onClick={() => handleCopy(contact.value, contact.id)}
                  className="w-8 h-8 rounded-lg bg-card-app/50 hover:bg-card-app border border-border-app flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer relative"
                  title={`Copy ${contact.name}`}
                >
                  {copiedId === contact.id ? (
                    <FiCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <FiCopy className="w-4 h-4" />
                  )}
                  {copiedId === contact.id && (
                    <span className="absolute -top-8 bg-neutral-900 text-white text-[10px] px-1.5 py-0.5 rounded shadow border border-neutral-800 font-bold whitespace-nowrap animate-bounce">
                      Copied!
                    </span>
                  )}
                </button>

                {/* External Link Button */}
                <a
                  href={contact.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-3 rounded-lg bg-accent-app/10 hover:bg-accent-app border border-accent-app/20 text-accent-app hover:text-white flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer"
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
