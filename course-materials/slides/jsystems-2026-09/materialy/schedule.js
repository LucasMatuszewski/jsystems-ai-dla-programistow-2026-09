/* One course schedule source for both day decks and the participant agenda.
   Set the actual course dates before delivery; date:null keeps preview alarms quiet. */
(() => {
  const common = {
    courseId:'jsystems-ai-dla-programistow-2026-09',
    timeZone:'Europe/Warsaw',
    start:'09:00', end:'16:00',
    breaks:[
      {time:'11:00', duration:15, label:'Przerwa poranna'},
      {time:'13:00', duration:30, label:'Przerwa obiadowa'},
      {time:null, duration:null, label:'Trzecia przerwa', optional:true}
    ]
  };
  window.COURSE_DAYS = [1,2].map(day => ({
    ...common, day, date:day === 1 ? '2026-09-28' : null, breaks:common.breaks.map(item => ({...item}))
  }));
})();
