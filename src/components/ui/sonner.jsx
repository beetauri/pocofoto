import { Toaster as Sonner } from 'sonner';

function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      toastOptions={{
        style: {
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--text-primary)',
          fontWeight: 800
        }
      }}
      {...props}
    />
  );
}

export { Toaster };
