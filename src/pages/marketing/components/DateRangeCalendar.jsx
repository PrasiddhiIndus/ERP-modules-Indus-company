import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const DateRangeCalendar = ({ startDate, endDate, onDateRangeChange, className = '' }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingStart, setSelectingStart] = useState(true);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const isDateInRange = (date) => {
    if (!startDate || !endDate) return false;
    const dateStr = formatDate(date);
    return dateStr > startDate && dateStr < endDate;
  };

  const isStartDate = (date) => {
    if (!startDate) return false;
    return formatDate(date) === startDate;
  };

  const isEndDate = (date) => {
    if (!endDate) return false;
    return formatDate(date) === endDate;
  };

  const isSameDate = (date) => {
    if (!startDate || !endDate) return false;
    return startDate === endDate && formatDate(date) === startDate;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const handleDateClick = (date) => {
    if (!date) return;

    const dateStr = formatDate(date);

    if (selectingStart || !startDate) {
      // Start selecting range
      onDateRangeChange({ startDate: dateStr, endDate: '' });
      setSelectingStart(false);
    } else {
      // Complete the range
      if (dateStr < startDate) {
        // If clicked date is before start date, make it the new start
        onDateRangeChange({ startDate: dateStr, endDate: startDate });
      } else {
        // Set as end date
        onDateRangeChange({ startDate, endDate: dateStr });
      }
      setSelectingStart(true);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const days = getDaysInMonth(currentMonth);

  return (
    <div className={`bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-md max-w-[240px] mx-auto ${className}`}>
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={goToPreviousMonth}
            className="p-1 hover:bg-purple-100 rounded-lg transition-colors group"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 group-hover:text-purple-600" />
          </button>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-800">
              {monthNames[currentMonth.getMonth()].substring(0, 3)} {currentMonth.getFullYear()}
            </h3>
            <button
              onClick={goToToday}
              className="px-2 py-0.5 text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium rounded-md transition-colors"
            >
              Today
            </button>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1 hover:bg-purple-100 rounded-lg transition-colors group"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-purple-600" />
          </button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayNames.map((day) => (
            <div key={day} className="text-center text-[10px] font-semibold text-gray-500 py-1">
              {day.substring(0, 1)}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-7" />;
            }

            const dateStr = formatDate(date);
            const inRange = isDateInRange(date);
            const isStart = isStartDate(date);
            const isEnd = isEndDate(date);
            const sameDate = isSameDate(date);
            const today = isToday(date);

            return (
              <button
                key={dateStr}
                onClick={() => handleDateClick(date)}
                className={`
                  h-7 w-7 text-xs rounded-md transition-all relative flex items-center justify-center font-medium
                  ${inRange ? 'bg-purple-100 text-purple-900' : ''}
                  ${isStart && !sameDate ? 'bg-purple-600 text-white font-bold rounded-l-md shadow-sm' : ''}
                  ${isEnd && !sameDate ? 'bg-purple-600 text-white font-bold rounded-r-md shadow-sm' : ''}
                  ${sameDate ? 'bg-purple-600 text-white font-bold shadow-md' : ''}
                  ${!inRange && !isStart && !isEnd && !sameDate ? 'hover:bg-gray-100 text-gray-700' : ''}
                  ${today && !inRange && !isStart && !isEnd && !sameDate ? 'ring-2 ring-purple-400 bg-purple-50' : ''}
                  ${date.getMonth() !== currentMonth.getMonth() ? 'text-gray-300' : ''}
                  active:scale-95
                `}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        {/* Selected range display - Compact */}
        {(startDate || endDate) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">From:</span>
                <span className="font-semibold text-gray-900 bg-purple-50 px-1.5 py-0.5 rounded">
                  {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: 'short'
                  }) : '-'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">To:</span>
                <span className="font-semibold text-gray-900 bg-purple-50 px-1.5 py-0.5 rounded">
                  {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: 'short'
                  }) : '-'}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                onDateRangeChange({ startDate: '', endDate: '' });
                setSelectingStart(true);
              }}
              className="w-full px-2 py-1 text-[10px] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700 font-medium"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DateRangeCalendar;

