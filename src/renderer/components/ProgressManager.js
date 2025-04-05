// Manages the progress ring UI, updating it based on download progress
export default class ProgressManager {
    constructor() {
      const circle = document.querySelector('.progress-ring__circle');
      this.radius = circle.r.baseVal.value;
      this.circumference = this.radius * 2 * Math.PI;
      circle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
      this.circle = circle;
    }
  
    setProgress(percent) {
      const offset = this.circumference - (percent / 100 * this.circumference);
      this.circle.style.strokeDashoffset = offset;
      document.getElementById('progressPercent').textContent = `${Math.round(percent)}%`;
    }
  }