/* global html */

export const RankingBadge = ({ rank }) => {
  if (!rank || rank > 3) return '';

  const badges = {
    1: {
      icon: '🏆',
      text: '#1',
      class: 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white border-yellow-500'
    },
    2: {
      icon: '🥈',
      text: '#2', 
      class: 'bg-gradient-to-r from-gray-300 to-gray-500 text-white border-gray-400'
    },
    3: {
      icon: '🥉',
      text: '#3',
      class: 'bg-gradient-to-r from-amber-600 to-amber-800 text-white border-amber-700'
    }
  };

  const badge = badges[rank];
  
  return html`
    <div class="absolute -top-2 -right-2 z-10">
      <div class="flex items-center gap-1 px-2 py-1 rounded-full border-2 shadow-lg ${badge.class}">
        <span class="text-sm">${badge.icon}</span>
        <span class="text-xs font-bold">${badge.text}</span>
      </div>
    </div>
  `;
};
