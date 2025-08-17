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
    
    // If it's before 8 AM today and it's a weekday, launch is today at 8 AM
    if (pstNow.getHours() < 8) {
      nextDate.setHours(8, 0, 0, 0);
      const dayOfWeek = nextDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // If today is a weekday, use today
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return nextDate;
      }
    }
    
    // Otherwise, find the next weekday at 8 AM
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
    <div class="border-t border-amber-200 bg-amber-50">
      <div class="container mx-auto px-4 py-4 flex items-center gap-3 text-amber-900">
        <span class="text-lg font-semibold">Next launch in</span>
        ${timeLeft.days > 0 ? html`<span class="inline-block rounded-md bg-amber-200/70 px-3 py-1 font-semibold">${timeLeft.days}d</span>` : ''}
        <span class="inline-block rounded-md bg-amber-200/70 px-3 py-1 font-semibold">${timeLeft.hours}h</span>
        <span class="inline-block rounded-md bg-amber-200/70 px-3 py-1 font-semibold">${timeLeft.minutes}m</span>
        <span class="inline-block rounded-md bg-amber-200/70 px-3 py-1 font-semibold">${timeLeft.seconds}s</span>
      </div>
    </div>
  `;
};
