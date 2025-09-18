
import React, { useRef, useEffect } from 'react';
import type { Chart } from 'chart.js';
import type { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4200);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colors = {
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-primary',
  };
  const icons = {
    success: 'fa-check-circle',
    danger: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
  };

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 text-white transition-all transform ${colors[toast.type]}`}>
      <i className={`fa ${icons[toast.type]} mr-2`}></i>
      {toast.message}
    </div>
  );
};

export const LoadingSpinner: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
        <p className="text-gray-700">正在分析数据，请稍候...</p>
      </div>
    </div>
  );
};

interface GroupModalProps {
  isOpen: boolean;
  products: string[];
  onConfirm: (selectedProducts: string[]) => void;
  onCancel: () => void;
}

export const GroupModal: React.FC<GroupModalProps> = ({ isOpen, products, onConfirm, onCancel }) => {
  const [selected, setSelected] = React.useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelected([]);
    }
  }, [isOpen]);
  
  const handleToggle = (productName: string) => {
    setSelected(prev => 
      prev.includes(productName) 
        ? prev.filter(p => p !== productName)
        : [...prev, productName]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-semibold mb-4">选择分组产品</h3>
        <div className="space-y-2 mb-4 overflow-y-auto">
          {products.map(name => (
             <div key={name} className="flex items-center">
               <input
                 id={`modal-${name}`}
                 type="checkbox"
                 value={name}
                 checked={selected.includes(name)}
                 onChange={() => handleToggle(name)}
                 className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
               />
               <label htmlFor={`modal-${name}`} className="ml-2 text-sm text-gray-700">{name}</label>
             </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-auto pt-4">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={() => onConfirm(selected)} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90">确认</button>
        </div>
      </div>
    </div>
  );
};

interface ChartCanvasProps {
    chartConfig: any;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({ chartConfig }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        if (ctx && chartConfig) {
            // @ts-ignore
            chartRef.current = new window.Chart(ctx, chartConfig);
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [chartConfig]);

    return <div className="h-80 relative"><canvas ref={canvasRef}></canvas></div>;
};

