import { useEffect, useState, type Ref } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

type CopyButtonProps = {
  text: string;
  ref?: Ref<HTMLButtonElement>;
};

export function CopyButton({ text, ref }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') {
      return;
    }

    const timeout = setTimeout(() => setStatus('idle'), 1500);
    return () => clearTimeout(timeout);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <button ref={ref} type="button" className="copy-button" data-status={status} onClick={copy}>
      {status === 'copied' ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      <span aria-live="polite">{status === 'copied' ? 'Copied' : status === 'failed' ? 'Failed' : 'Copy'}</span>
    </button>
  );
}
