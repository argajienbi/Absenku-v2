import React from 'react';

export function WaveBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full relative bg-teal-50 dark:bg-gray-900 overflow-hidden font-sans transition-colors duration-500">
      {/* Background SVG Waves */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <svg
          className="absolute top-0 w-full h-auto text-teal-500 dark:text-teal-900 opacity-20 dark:opacity-30 mix-blend-overlay"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            fillOpacity="1"
            d="M0,224L48,213.3C96,203,192,181,288,192C384,203,480,245,576,234.7C672,224,768,160,864,154.7C960,149,1056,203,1152,213.3C1248,224,1344,192,1392,176L1440,160L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"
          ></path>
        </svg>

        <svg
          className="absolute bottom-0 w-full h-auto text-teal-600 dark:text-teal-800 opacity-20 dark:opacity-40 mix-blend-overlay"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            fillOpacity="1"
            d="M0,192L48,197.3C96,203,192,213,288,213.3C384,213,480,203,576,170.7C672,139,768,85,864,85.3C960,85,1056,139,1152,149.3C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          ></path>
        </svg>
      </div>

      {/* Main Content Layout */}
      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>
    </div>
  );
}
