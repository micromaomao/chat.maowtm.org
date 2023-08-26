import React from "react";

export interface P {
  time: number | Date;
}

export class Humantime extends React.Component<P> {
  interval: number | null = null;

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this.interval = setInterval(() => {
      this.forceUpdate();
    }, 1000);
  }

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  render() {
    let time = this.props.time;
    if (typeof time != "number") {
      time = time.getTime();
    }
    let now = Date.now();
    let delta = Math.abs(now - time);
    let text = "";

    const S = 1000;
    const M = 60 * S;
    const H = 60 * M;
    const D = 24 * H;
    if (delta > D) {
      let d = Math.floor(delta / D);
      text = `${d} day${d > 1 ? "s" : ""}`;
    } else if (delta > H) {
      let h = Math.floor(delta / H);
      text = `${h} hour${h > 1 ? "s" : ""}`;
    } else if (delta > M) {
      let m = Math.floor(delta / M);
      text = `${m} minute${m > 1 ? "s" : ""}`;
    } else {
      text = `${Math.floor(delta / S)} seconds`;
    }

    if (time < now) {
      text += " ago";
    } else {
      text = "in " + text;
    }

    return <span title={new Date(time).toISOString()}>{text}</span>;
  }
}
