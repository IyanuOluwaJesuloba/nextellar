'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../contexts';

// Simple inline SVG icons
const WalletIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const LoaderIcon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface WalletConnectButtonProps {
  theme?: 'light' | 'dark';
}

/**
 * Simple Wallet Connect Button - Matches the "Deploy to Stellar" button style
 * 
 * A clean, reusable button component that integrates with Stellar wallets.
 * Follows the same design system as the main CTA buttons.
 */
export default function WalletConnectButton({ theme = 'light' }: WalletConnectButtonProps) {
  const { connected, connect, disconnect, walletName } = useWallet();
  const [isLoading, setIsLoading] = useState(false);

  // Custom modal content replacer
  useEffect(() => {
    /**
     * NOTE:
     * The original implementation observed the entire document body continuously
     * and mutated the Wallets Kit modal's DOM after it rendered. That approach is
     * fragile and expensive. We still prefer using the kit's API, however some
     * older versions of the kit may not expose a render hook for custom modal
     * content. To remain compatible while avoiding a continuous observer, we
     * implement a scoped observer strategy:
     *  - Observe document.body only until the kit modal appears
     *  - Once modal element is found, disconnect the body observer
     *  - Attach an observer to the modal element only (to handle internal changes)
     *  - When the modal is removed/closed, disconnect modal observer and resume
     *    watching for future modal opens
     */

    let bodyObserver: MutationObserver | null = null;
    let modalObserver: MutationObserver | null = null;

    const replaceModalContent = (modal: Element) => {
      try {
        // Find and hide text nodes that are known to be noisy in the default modal
        const walker = document.createTreeWalker(modal, NodeFilter.SHOW_TEXT);
        const textNodes: Node[] = [];
        let node: Node | null = null;
        while ((node = walker.nextNode())) {
          textNodes.push(node);
        }

        textNodes.forEach(textNode => {
          const text = textNode.textContent || '';
          if (
            text.includes('Learn more') ||
            text.includes('What is a Wallet') ||
            text.includes('What is Stellar') ||
            text.includes('Wallets are used to send') ||
            text.includes('Stellar is a decentralized')
          ) {
            const parent = textNode.parentElement;
            if (parent) parent.style.display = 'none';
          }
        });

        // Append a lightweight custom message block if missing
        if (!modal.querySelector('.custom-stellar-message')) {
          const customMessage = document.createElement('div');
          customMessage.className = 'custom-stellar-message';
          customMessage.setAttribute('role', 'note');
          customMessage.innerHTML = `
            <div style="padding:16px;margin:16px 0;border-radius:8px;border:1px solid rgba(156,163,175,0.15);background:var(--background,transparent);color:var(--foreground,inherit);font-size:14px;line-height:1.5;">
              ✨ The Stellar SDK is integrated into this template. Use this Connect Wallet button to connect to Freighter, Albedo, Lobstr and other popular wallets.
            </div>
          `;
          modal.appendChild(customMessage);
        }
      } catch (err) {
        // Defensive: do not let DOM tweaks break the app
        // Keep errors silent but logged for debugging
        // eslint-disable-next-line no-console
        console.error('replaceModalContent error:', err);
      }
    };

    // Body observer: watches only until we detect a modal element
    bodyObserver = new MutationObserver((mutations, obs) => {
      const modal = document.querySelector('[class*="swk"], [class*="modal"]');
      if (modal) {
        // Found modal: apply replacement and switch to modal-scoped observer
        replaceModalContent(modal);
        obs.disconnect();

        // Observe the modal for internal changes while it's open
        modalObserver = new MutationObserver(() => {
          // Debounced-ish re-apply to the modal when its internal content changes
          setTimeout(() => replaceModalContent(modal), 50);
        });

        try {
          modalObserver.observe(modal, { childList: true, subtree: true });
        } catch (e) {
          // If observe fails (detached node), ignore
        }

        // Watch for modal removal: periodically check if modal is still in DOM
        const removalCheck = setInterval(() => {
          if (!document.body.contains(modal)) {
            if (modalObserver) {
              modalObserver.disconnect();
              modalObserver = null;
            }
            clearInterval(removalCheck);
            // Re-attach body observer to listen for next modal open
            if (bodyObserver && bodyObserver.disconnect) {
              // Start observing again
              bodyObserver.observe(document.body, { childList: true, subtree: true });
            }
          }
        }, 300);
      }
    });

    // Start observing body but keep the scope and work minimal
    try {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    } catch (err) {
      // In some SSR or restricted environments document.body may not be available
    }

    // Cleanup on unmount
    return () => {
      if (bodyObserver) bodyObserver.disconnect();
      if (modalObserver) modalObserver.disconnect();
    };
  }, []);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (connected) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (error) {
      console.error('Wallet operation failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return connected ? 'Disconnecting...' : 'Connecting...';
    if (connected) return `Disconnect ${walletName}`;
    return 'Connect Wallet';
  };

  const getIcon = () => {
    if (isLoading) return <LoaderIcon />;
    return <WalletIcon />;
  };

  return (
    <button 
      onClick={handleClick}
      disabled={isLoading}
      className={`px-8 py-3 font-medium rounded-full transition-colors ${
        theme === 'light' 
          ? 'bg-black text-white hover:bg-gray-800' 
          : 'bg-white text-black hover:bg-gray-200'
      } ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
    >
      <span className="flex items-center gap-2">
        {getIcon()}
        {getButtonText()}
      </span>
    </button>
  );
}