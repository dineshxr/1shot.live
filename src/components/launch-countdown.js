/* global html, useState, useEffect */

export const LaunchCountdown = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [nextLaunchDate, setNextLaunchDate] = useState(null);
  const [isWeekend, setIsWeekend] = useState(false);

  // Calculate next launch date (weekday at 8 AM PST, skipping weekends)
  const getNextLaunchDate = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    
    let nextDate = new Date(pstNow);
    
    // If it's before 8 AM today and it's a weekday, launch is today at 8 AM PST
    if (pstNow.getHours() < 8) {
      nextDate.setHours(8, 0, 0, 0);
      const dayOfWeek = nextDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // If today is a weekday, use today
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return nextDate;
      }
    }
    
    // Otherwise, find the next weekday at 8 AM PST
    nextDate.setDate(pstNow.getDate() + 1);
    nextDate.setHours(8, 0, 0, 0);
    
    // Keep incrementing until we hit a weekday
    while (true) {
      const dayOfWeek = nextDate.getDay();
      
      // If it's a weekday (Monday = 1 through Friday = 5), we found our date
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        break;
      }
      
      // Otherwise, move to next day
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    return nextDate;
  };

  // Check if we're currently in a weekend
  const checkIfWeekend = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const dayOfWeek = pstNow.getDay(); // 0 = Sunday, 6 = Saturday
    
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Calculate time remaining
  const calculateTimeLeft = () => {
    const now = new Date();
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = getNextLaunchDate();
    
    const difference = target.getTime() - pstNow.getTime();
    
    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }
    
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  };

  useEffect(() => {
    // Initial calculation
    const updateCountdown = () => {
      setTimeLeft(calculateTimeLeft());
      setNextLaunchDate(getNextLaunchDate());
      setIsWeekend(checkIfWeekend());
    };
    
    updateCountdown();
    
    // Update every second
    const timer = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
  };

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: 'America/Los_Angeles'
    });
  };

  return html`
    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-3">
      <div class="flex flex-wrap items-center gap-3 text-gray-900">
        <span class="text-sm font-medium text-gray-600">Next launch in</span>
        <div class="flex items-center gap-1.5">
          ${timeLeft.days > 0 ? html`
            <span class="inline-flex items-baseline gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1 text-sm font-semibold tabular-nums">
              ${timeLeft.days}<span class="text-[10px] font-normal opacity-70 ml-0.5">d</span>
            </span>
          ` : ''}
          <span class="inline-flex items-baseline gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1 text-sm font-semibold tabular-nums">
            ${String(timeLeft.hours).padStart(2, '0')}<span class="text-[10px] font-normal opacity-70 ml-0.5">h</span>
          </span>
          <span class="inline-flex items-baseline gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1 text-sm font-semibold tabular-nums">
            ${String(timeLeft.minutes).padStart(2, '0')}<span class="text-[10px] font-normal opacity-70 ml-0.5">m</span>
          </span>
          <span class="inline-flex items-baseline gap-1 rounded-lg bg-gray-900 text-white px-2.5 py-1 text-sm font-semibold tabular-nums">
            ${String(timeLeft.seconds).padStart(2, '0')}<span class="text-[10px] font-normal opacity-70 ml-0.5">s</span>
          </span>
        </div>
      </div>
    </div>
  `;
};
