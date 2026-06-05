import { motion } from 'framer-motion';

export default function AppBackground() {
  return (
    <div className="app-background" aria-hidden="true">
      <motion.div
        className="absolute -top-32 -right-32 size-80 rounded-full bg-[#4F72FC]/30 blur-[100px]"
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -20, 30, 0],
          scale: [1, 1.1, 0.95, 1]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      <motion.div
        className="absolute -bottom-40 -left-40 size-96 rounded-full bg-[#6F8BFF]/25 blur-[120px]"
        animate={{
          x: [0, -25, 35, 0],
          y: [0, 35, -15, 0],
          scale: [1, 0.9, 1.1, 1]
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      <motion.div
        className="absolute bottom-1/4 left-1/2 -translate-x-1/2 size-64 rounded-full bg-[#4F72FC]/20 blur-[80px]"
        animate={{
          x: ['-50%', '-40%', '-60%', '-50%'],
          y: [0, 20, -10, 0],
          scale: [1, 1.15, 0.9, 1]
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
    </div>
  );
}
