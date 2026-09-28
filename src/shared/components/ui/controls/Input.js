"use client";

import { forwardRef } from "react";
import Form from "react-bootstrap/Form";

const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  const mergedClassName = ["psb-ui-input", className].filter(Boolean).join(" ");

  return <Form.Control ref={ref} className={mergedClassName} {...props} />;
});

export default Input;
