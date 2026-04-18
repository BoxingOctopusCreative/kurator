"use client";
import Link from "next/link";

export function Copyright() {
  return (
    <div className="flex flex-col items-center justify-center">
        <p className="text-center text-xs">
            A <Link href="https://boxingoctop.us" target="_blank" rel="noopener noreferrer" className=" text-kurator-muted text-kurator-accent/90 hover:underline">Boxing Octopus Creative</Link> project.
            <br />
            Copyright {new Date().getFullYear()} All rights reserved.
        </p>
    </div>
  );
}