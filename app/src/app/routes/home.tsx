import React from "react";
import { Link } from "react-router-dom";

function Component() {
  return (
    <div>
      Home<br />
      <Link to="/admin">Admin</Link>
    </div>
  );
}

export { Component };
