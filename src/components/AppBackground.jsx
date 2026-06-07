import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

function useCanAnimateBackground() {
  const [canAnimate, setCanAnimate] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 701px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const update = () => setCanAnimate(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);

  return canAnimate;
}

function BackgroundBlob({ animate, className, motionProps }) {
  if (!animate) {
    return <div className={className} />;
  }

  return <motion.div className={className} {...motionProps} />;
}

export default function AppBackground() {
  const canAnimate = useCanAnimateBackground();

  return (
    <div className="app-background" aria-hidden="true">
      <BackgroundBlob
        animate={canAnimate}
        className="app-background-blob app-background-blob-top absolute -top-32 -right-32 size-80 rounded-full bg-[#4F72FC]/30 blur-[100px]"
        motionProps={{
          animate: {
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
            scale: [1, 1.1, 0.95, 1]
          },
          transition: {
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut'
          }
        }}
      />
      <BackgroundBlob
        animate={canAnimate}
        className="app-background-blob app-background-blob-bottom absolute -bottom-40 -left-40 size-96 rounded-full bg-[#6F8BFF]/25 blur-[120px]"
        motionProps={{
          animate: {
            x: [0, -25, 35, 0],
            y: [0, 35, -15, 0],
            scale: [1, 0.9, 1.1, 1]
          },
          transition: {
            duration: 15,
            repeat: Infinity,
            ease: 'easeInOut'
          }
        }}
      />
      <BackgroundBlob
        animate={canAnimate}
        className="app-background-blob app-background-blob-center absolute bottom-1/4 left-1/2 -translate-x-1/2 size-64 rounded-full bg-[#4F72FC]/20 blur-[80px]"
        motionProps={{
          animate: {
            x: ['-50%', '-40%', '-60%', '-50%'],
            y: [0, 20, -10, 0],
            scale: [1, 1.15, 0.9, 1]
          },
          transition: {
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut'
          }
        }}
      />
    </div>
  );
}
