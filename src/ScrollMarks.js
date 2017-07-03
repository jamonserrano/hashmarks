/* eslint-env browser, amd, commonjs, es6 */

/*
 * Scrollmarks
 * Copyright (c) 2017 Viktor Honti
 * Licensed under the MIT License.
 * https://github.com/jamonserrano/scrollmarks
 */

// store for scrollmarks
const scrollMarks = new Map();
// index of scrollmarks
let index = 0;
// queue for triggered marks
let queue = [];

// started state
let running = false;
// central clock
let clock;

// document was scrolled
let scrolled = false;	
// frame counter for scroll events
let scrollTick = 0;
// throttle for scroll events (configurable)
let scrollThrottle = 10;
// previous scroll position;
let previousScroll = 0;
// scroll direction
let scrollDirection;

// document was resized
let resized = false;
// frame counter for resize events
let resizeTick = 0;
// throttle for resize events (configurable)
let resizeThrottle = 30;
// documentElement cached
const documentElement = document.documentElement;
// previous document height
let previousHeight = documentElement.scrollHeight;

// browser support idle callback
const hasIdleCallback = window.requestIdleCallback;
// maximum allowed timeout (configurable)
let idleTimeout = 100;

// event listener properties (false by default)
let listenerProperties = false;
// set passive listener if available
window.addEventListener("test", null, {
	get passive() {
		listenerProperties = {
			passive: true
		}
	}
});

/**
 * Add a new scrollmark
 * @public
 * @param {Object} mark
 * @param {HTMLElement} mark.element
 * @param {Function} mark.callback
 * @param {(number|string|function)} [mark.offset]
 * @param {('up'|'down')} [mark.direction]
 * @param {boolean} [mark.once]
 * @return {number} key
 */
function add (mark) {
	const { element, callback, offset, direction, once } = mark;

	if (!(element instanceof HTMLElement)) {
		throw new TypeError(`Parameter 'element' must be an HTML Element, got ${element} instead`);
	}
	
	if (typeof callback !== 'function') {
		throw new TypeError(`Parameter 'callback' must be a function, got ${callback} instead`);
	}
	
	if (typeof offset === 'undefined') {
		// default
		mark.computedOffset = 0;
	} else if (typeof offset === 'string' && offset.endsWith('%')) {
		// generate function from percentage (viewport size can change)
		mark.computedOffset = () => window.innerHeight * parseInt(offset) / 100;
	} else if (!Number.isNaN(offset) || typeof offset === 'function') {
		mark.computedOffset = offset;
	} else {
		throw new TypeError(`Optional parameter 'offset' must be a number, a percentage, or a function, got ${offset} instead`);
	}
	
	if (direction && direction !== 'up' && direction !== 'down') {
		throw new TypeError(`Optional parameter 'direction' must be either 'up' or 'down', got ${direction} instead`);
	}

	if (typeof once !== 'undefined' && typeof once !== 'boolean') {
		throw new TypeError(`Optional parameter 'once' must be true or false, got ${once} instead`);
	}

	calculateTriggerPoint(mark);
	
	const key = index++;
	mark.key = key;		
	scrollMarks.set(key, mark);
	
	if (!running) {
		start();
	} else if (directionMatches(direction, 'down') && mark.triggerPoint <= window.pageYOffset) {
		// don't wait until the next event to trigger the mark
		trigger(mark);
	}

	return key;
}

/**
 * Remove a scrollmark
 * @public
 * @param {number} key
 */
function remove (key) {
	scrollMarks.delete(key);
	if (!scrollMarks.size) {
		stop();
	}
}

/**
 * Start listening
 * @public
 */
function start () {
	if (!running) {
		running = true;
		checkMarks();

		window.addEventListener('scroll', onScroll, listenerProperties);
		window.addEventListener('resize', onResize, listenerProperties);
		clock = window.requestAnimationFrame(checkState);
	}
}

/**
 * Stop listening
 * @public
 */
function stop () {
	if (running) {
		window.removeEventListener('scroll', onScroll, listenerProperties);
		window.removeEventListener('resize', onResize, listenerProperties);
		window.cancelAnimationFrame(clock);
		
		running = false;
		resetTicks();
	}
}

/**
 * Scroll event listener
 * Sets the scrolled flag for the clock
 */
function onScroll () {
	window.requestAnimationFrame(() => scrolled = true);
}

/**
 * Resize listener
 * Sets the resized flag for the clock
 */
function onResize () {
	window.requestAnimationFrame(() => resized = true);
}

/**
 * Single handler for scroll, document height, and page resize
 */
function checkState () {
	// resize check
	if (resizeTick === resizeThrottle) {
		if (resized) {
			// document was resized
			idle(updateTriggerPoints);
			resized = false;
		} else {
			// check the height
			const height = documentElement.scrollHeight;
			if (previousHeight !== height) {
				idle(updateTriggerPoints);
				previousHeight = height;
			}
		}
		resizeTick = 0;
	} else {
		resizeTick++;
	}

	// scroll check
	if (scrollTick === scrollThrottle) {
		if (scrolled) {
			checkMarks();
			scrolled = false;
		}
		scrollTick = 0;
	} else {
		scrollTick++;
	}

	clock = window.requestAnimationFrame(checkState);
}


/**
 * Checks if scrollmarks should be triggered
 */
function checkMarks () {
	// get scroll position and direction
	const currentScroll = window.pageYOffset;
	scrollDirection = previousScroll < currentScroll ? 'down' : 'up';
	
	scrollMarks.forEach((mark) => {
		const markDirection = mark.direction;
		// 1st check: element is visible and direction matches (or not defined)
		if (mark.element.offsetParent !== null && directionMatches(markDirection)) {
			const triggerPoint = mark.triggerPoint;
			// 2nd check: element actually crossed the mark (below -> above or above -> below)
			if ((previousScroll < triggerPoint) === (triggerPoint <= currentScroll)) {
				// mark should be triggered
				queue.push(mark);
			}
		}
	});
	// trigger affected marks
	triggerQueue();
	// prepare for next run
	previousScroll = currentScroll;
}

/**
 * Trigger affected scrollmarks
 */
function triggerQueue () {
	// put trigger marks in order
	queue.sort(scrollDirection === 'down' ? sortAscending : sortDescending);
	// call each mark
	queue.forEach(trigger);
	// empty queue
	queue = [];
}

/**
 * Trigger a single mark
 * @param {Object} mark 
 */
function trigger(mark) {
	mark.callback(mark, scrollDirection)

	if (mark.once) {
		remove(mark.key);
	}
}

/**
 * Sort by ascending triggerpoints
 * @param {Object} a mark 
 * @param {Object} b mark
 * @return {number}
 */
function sortAscending (a,b) {
	return a.triggerPoint - b.triggerPoint;
}

/**
 * Sort by descending triggerpoints
 * @param {Object} a mark 
 * @param {Object} b mark
 * @return {number}
 */
function sortDescending (a,b) {
	return b.triggerPoint - a.triggerPoint;
}

/**
 * Check if the mark's direction matches the current (or provided) scroll direction
 * @param {('up'|'down'|undefined)} markDirection 
 * @param {('up'|'down')} [direction]
 * @return {boolean} match
 */
function directionMatches(markDirection, direction) {
	return !markDirection || markDirection === (direction || scrollDirection);
}

/**
 * Update all trigger points
 */
function updateTriggerPoints () {
	scrollMarks.forEach(calculateTriggerPoint);
}

/**
 * Calculate a trigger point
 * @param {Object} mark 
 */
function calculateTriggerPoint (mark) {
	const computedOffset = mark.computedOffset;
	const offsetValue = typeof computedOffset === 'function' ? computedOffset(mark.element) : computedOffset;
	mark.triggerPoint = window.pageYOffset + mark.element.getBoundingClientRect().top - offsetValue;
}

/**
 * Run an idle callback
 * @param {Function} func 
 */
function idle(func) {
	if (hasIdleCallback) {
		window.requestIdleCallback(func, {timeout: idleTimeout});
	} else {
		window.setTimeout(func, 0);
	}
}

/**
 * Refresh one or all marks
 * @public
 * @param {number} [key] 
 */
function refresh(key) {
	if (typeof key === 'undefined') {
		idle(updateTriggerPoints);
	} else if (scrollMarks.has(key)) {
		idle(() => calculateTriggerPoint(scrollMarks.get(key)));
	} else {
		throw new ReferenceError(`Could not refresh scrollmark '${key}', scrollmark doesn't exist`);
	}
}

/**
 * Set options
 * @public
 * @param {Object} options 
 * @param {number} options.scrollThrottle
 * @param {number} options.resizeThrottle
 * @param {number} options.idleTimeout
 */
function config (options) {
	const newScrollThrottle = options.scrollThrottle;
	const newResizeThrottle = options.resizeThrottle;
	const newIdleTimeout = options.idleTimeout;

	if (Number.isNaN(newScrollThrottle)) {
		throw new TypeError(`Config parameter 'scrollThrottle' must be a number, got ${newScrollThrottle} instead`);
	} else if (newScrollThrottle < 0) {
		throw new RangeError(`Config parameter 'scrollThrottle' must be at least 0, got ${newScrollThrottle} instead`);
	} else {
		scrollThrottle = newScrollThrottle;
	}

	if (Number.isNaN(newResizeThrottle)) {
		throw new TypeError(`Config parameter 'resizeThrottle' must be a number, got ${newResizeThrottle} instead`);
	} else if (newResizeThrottle < 0) {
		throw new RangeError(`Config parameter 'resizeThrottle' must be at least 0, got ${newResizeThrottle} instead`);
	} else {
		resizeThrottle = newResizeThrottle;
	}

	if (Number.isNaN(newIdleTimeout)) {
		throw new TypeError(`Config parameter 'idleTimeout' must be a number, got ${newIdleTimeout} instead`);
	} else if (newIdleTimeout < 1) {
		throw new RangeError(`Config parameter 'idleTimeout' must be a positive number, got ${newIdleTimeout} instead`);
	} else {
		idleTimeout = newIdleTimeout;
	}

	if (running) {
		resetTicks();
	}
}

/**
 * Reset ticks
 */
function resetTicks() {
	scrollTick = 0;
	resizeTick = 0;
}

export default {add, remove, start, stop, config, refresh};