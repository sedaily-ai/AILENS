'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface ToggleSectionProps {
  title: string;
  subtitle?: string;
  titleClassName?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ToggleSection({ title, subtitle, titleClassName, children, defaultOpen = false }: ToggleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      // After transition, set to auto so dynamic content works
      const timer = setTimeout(() => setHeight(undefined), 250);
      return () => clearTimeout(timer);
    } else {
      // Set explicit height first so transition works
      setHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  return (
    <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 bg-transparent border-none cursor-pointer text-left"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <span className={titleClassName ?? 'text-[15px] font-bold text-gray-500 dark:text-gray-400 tracking-wide'}>
            {title}
          </span>
          {subtitle && !open && (
            <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
              {subtitle}
            </p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        ref={contentRef}
        className="transition-[height] duration-250 ease-in-out overflow-hidden"
        style={{ height: height === undefined ? 'auto' : height }}
      >
        <div className="px-5 pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
