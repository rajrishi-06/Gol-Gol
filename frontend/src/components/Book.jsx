import React from 'react';
import Leftside from './BookLeft';
import Rightside from './BookRight';

export default function Book(props) {
  

  return (
    <div className="flex flex-col sm:flex-row h-screen">
      <Leftside fromCords={props.fromCords} toCords={props.toCords} />
      <Rightside fromCords={props.fromCords} toCords={props.toCords} />
    </div>
  );
}