import React from 'react';

export function Slider({ label, value, min, max, unit = '', onChange, step }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void; step?: number }) {
  const currentStep = step || (min < 5 && max < 10 ? 0.1 : 1);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-outline font-bold">
        <span>{label}</span>
        <span>{value}{unit}</span>
      </div>
      <input 
        type="range" min={min} max={max} step={currentStep}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}
