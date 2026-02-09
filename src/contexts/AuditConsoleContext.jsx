// src/contexts/AuditConsoleContext.jsx
import React, { createContext, useContext, useState } from 'react';

const AuditConsoleContext = createContext();

export const useAuditConsole = () => {
  const context = useContext(AuditConsoleContext);
  if (!context) {
    throw new Error('useAuditConsole must be used within an AuditConsoleProvider');
  }
  return context;
};

export const AuditConsoleProvider = ({ children }) => {
  const [isConsoleVisible, setIsConsoleVisible] = useState(false);

  const toggleConsole = () => {
    setIsConsoleVisible(!isConsoleVisible);
  };

  const closeConsole = () => {
    setIsConsoleVisible(false);
  };

  const openConsole = () => {
    setIsConsoleVisible(true);
  };

  return (
    <AuditConsoleContext.Provider
      value={{
        isConsoleVisible,
        toggleConsole,
        closeConsole,
        openConsole,
        setIsConsoleVisible
      }}
    >
      {children}
    </AuditConsoleContext.Provider>
  );
};
