export const SHIFTS = {
  shift1: {
    name: "Shift 1",
    label: "Pagi",
    color: "#0d9488", // teal-600
    workDays: {
      0: null, // Sunday
      1: { start: "06:00", end: "14:00" }, 
      2: { start: "06:00", end: "14:00" }, 
      3: { start: "06:00", end: "14:00" }, 
      4: { start: "06:00", end: "14:00" }, 
      5: { start: "06:00", end: "14:00" }, 
      6: { start: "07:00", end: "12:00" }  
    }
  },
  shift2: {
    name: "Shift 2",
    label: "Siang",
    color: "#d97706", // amber-600
    workDays: {
      0: { start: "07:00", end: "12:00" }, 
      1: { start: "13:00", end: "21:00" }, 
      2: { start: "13:00", end: "21:00" }, 
      3: { start: "13:00", end: "21:00" }, 
      4: { start: "13:00", end: "21:00" }, 
      5: { start: "13:00", end: "21:00" }, 
      6: null                              
    }
  },
  shift3: {
    name: "Shift 3",
    label: "Malam",
    color: "#4f46e5", // indigo-600
    workDays: {
      0: { start: "21:00", end: "06:00" },
      1: { start: "21:00", end: "06:00" },
      2: { start: "21:00", end: "06:00" },
      3: { start: "21:00", end: "06:00" },
      4: { start: "21:00", end: "06:00" },
      5: { start: "21:00", end: "06:00" },
      6: { start: "21:00", end: "06:00" }
    }
  }
};
