import React, {lazy, Suspense} from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import { App } from "./App.jsx";
import { registerOfflineSupport } from "./offline.js";
import "./styles.css";

const CoachReview=lazy(()=>import("./CoachReview.jsx").then(m=>({default:m.CoachReview})));
const reviewMode=new URLSearchParams(location.search).get("coach")==="review";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {reviewMode ? <Suspense fallback={<p>Opening coach reviews…</p>}><CoachReview /></Suspense> : <App />}
  </React.StrictMode>,
);

registerOfflineSupport();
