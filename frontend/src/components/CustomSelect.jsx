import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({ value, onChange, options, className, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value || opt.value === String(value) || opt.value === Number(value));

  const handleSelect = (val) => {
    onChange({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className={`${className} flex justify-between items-center cursor-pointer transition-all ${isOpen ? 'ring-2 ring-blue-500' : ''}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder || 'Pilih...'}</span>
        <ChevronDown size={16} className={`shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 origin-top">
          {options.map(opt => (
            <div 
              key={opt.value} 
              onClick={() => handleSelect(opt.value)}
              className={`px-4 py-3 cursor-pointer transition-colors text-sm ${
                (value === opt.value || value === String(opt.value)) 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' 
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
