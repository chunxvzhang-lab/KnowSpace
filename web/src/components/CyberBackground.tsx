import React, { useEffect, useRef } from 'react';

interface CyberBackgroundProps {
  theme: 'dark' | 'light' | 'eink';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
}

export const CyberBackground: React.FC<CyberBackgroundProps> = ({ theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = -1000;
    let mouseY = -1000;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Color palette according to theme
    const getNodeColor = (alpha: number) => {
      if (theme === 'dark') return `rgba(56, 189, 248, ${alpha})`;
      if (theme === 'light') return `rgba(2, 132, 199, ${alpha})`;
      return `rgba(50, 50, 50, ${alpha})`;
    };

    const getLineColor = (alpha: number) => {
      if (theme === 'dark') return `rgba(99, 102, 241, ${alpha})`;
      if (theme === 'light') return `rgba(217, 119, 6, ${alpha})`;
      return `rgba(100, 100, 100, ${alpha})`;
    };

    const getMouseLineColor = (alpha: number) => {
      if (theme === 'dark') return `rgba(56, 189, 248, ${alpha})`;
      if (theme === 'light') return `rgba(2, 132, 199, ${alpha})`;
      return `rgba(30, 30, 30, ${alpha})`;
    };

    // Initialize particles
    const particleCount = Math.min(75, Math.floor((width * height) / 18000));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        radius: Math.random() * 2 + 1,
        baseAlpha: Math.random() * 0.4 + 0.2
      });
    }

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw cyber subtle grid in dark mode
      if (theme === 'dark') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.lineWidth = 1;
        const gridSize = 48;
        const startX = 0;
        const startY = 0;
        for (let x = startX; x < width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = startY; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += p.vx;
        p.y += p.vy;

        // Bounce on boundaries
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Draw particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = getNodeColor(p.baseAlpha);
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.18;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = getLineColor(alpha);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Interactive mouse connection
        if (mouseX > 0 && mouseY > 0) {
          const mdx = p.x - mouseX;
          const mdy = p.y - mouseY;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mdist < 180) {
            const malpha = (1 - mdist / 180) * 0.45;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.strokeStyle = getMouseLineColor(malpha);
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Slight magnetic pull toward cursor
            p.x -= (mdx / mdist) * 0.4;
            p.y -= (mdy / mdist) * 0.4;
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: theme === 'dark' ? 0.85 : 0.4,
        transition: 'opacity 0.4s ease'
      }}
    />
  );
};
