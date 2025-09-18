
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <i className="fa fa-line-chart text-primary text-2xl"></i>
          <h1 className="text-xl font-bold text-primary">净值分析工具</h1>
        </div>
        <div className="text-sm text-gray-500">版本 2025.3 (React)</div>
      </div>
    </header>
  );
};

export default Header;
