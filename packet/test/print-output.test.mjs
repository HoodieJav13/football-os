import assert from 'node:assert/strict';
import {test} from 'node:test';
import {controllerWith,DAY_60} from './helpers.mjs';
test('rapid printing of different output is allowed while identical repeats are suppressed',()=>{
 const {controller,prints}=controllerWith();controller.init();controller.loadSample();controller.chooseDay(DAY_60);
 controller.printPacket();controller.chooseOutput('assignment');controller.printPacket();controller.chooseOutput('identify');controller.printPacket();
 assert.equal(prints.length,3);controller.printPacket();assert.equal(prints.length,3);
});
