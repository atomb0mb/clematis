/**
 * Instrumentation of the JavaScript language in order to better understand the occurrence of DOM events. Specifically, DOM events which
 * are generated by user-actions are tied to their callback functions. The ordering of event listeners is captured by the
 * instrumentation process as well. For a given webpage, this instrumentation must be done after all DOM elements have been loaded
 * but before any event listeners are added by the original web-application.
 */
function traverse(node, func, path) {
	var key, child;

	if (typeof path === 'undefined') {
		path = [];
	}

	function recursiveWrapper(nextNode) {
		traverse(nextNode, func, [node].concat(path));
	}

	// Call analyzer function on current node
	var returnValue = func.call(null, node, path);

	// Recursive check all children of current node
	for (key in node) {
		if (node.hasOwnProperty(key)) {
			child = node[key];
			if (typeof child === 'object' && child !== null) {
				if (Array.isArray(child)) {
					child.forEach(recursiveWrapper);
				} else {
					traverse(child, func, [node].concat(path));
				}
			}
		}
	}
	return returnValue;
}

function exitSnapshot(info) {
	var j, trace = '';
	trace += 'send(JSON.stringify({messageType: "FUNCTION_EXIT", timeStamp: Date.now(), targetFunction: "' + info.name + '",lineNo: ' + info.line + ', scopeName: "n/a", counter:traceCounter++}));';
	return trace;
}

function callSnapshot(info, flag) {
	var j, trace = '';

	// front
	if (flag === 'front') {
		trace += 'FCW(';
		// back
	} else {
		trace += ',"' + info.name + '",' + info.line + ')';
	}
	return trace;
}

function returnSnapshot(info, flag) {
	var j, trace = '';

	// front
	if (flag === 'front') {
		trace += 'RSW(';
		// back
	} else {
		trace += ',"' + info.name + '",' + info.line + ')';
	}
	return trace;
}

function enterSnapshot(info) {
	var j, trace = '';
	trace += 'send(JSON.stringify({messageType: "FUNCTION_ENTER", timeStamp: Date.now(), targetFunction: "' + info.name + '",lineNo: ' + info.line + ', scopeName: "n\a", counter:traceCounter++}));';
	return trace;
}

var _clematisCounter = -1;

//EventListenerWrapper class definition
function EventListenerWrapper(targetPrototype, listenerSetter, listenerRemover) {
	if ((targetPrototype instanceof Object) && (listenerSetter.linsteners instanceof Object) && typeof (this.restore) === "function") {
		this.restore.apply(this, arguments);
	} else if ((targetPrototype instanceof Object) && typeof (listenerSetter) === "string" && typeof (listenerRemover) === "string") {
		var copyOfSetterFunction = targetPrototype[listenerSetter];
		targetPrototype.originalSetter = listenerSetter;
		if (Object.prototype.toString.apply(targetPrototype[listenerSetter]) === '[object Function]' && targetPrototype[listenerSetter].name !== "_clematisSetter") {

			function _clematisSetter(arg0, arg1) {
				var indx, oldListenerAdder, overwrittenListenerAdder;
				if (Object.prototype.toString.apply(arg0) === '[object Function]') {
					indx = 0;
					// original function handler
					oldListenerAdder = arg0;
					// overwritten event listener is the wrapper function, contains orig
					overwrittenListenerAdder = arg0 = overwriteEventListener(oldListenerAdder, this, arg1);
				} else if (Object.prototype.toString.apply(arg1) === '[object Function]') {
					indx = 1;
					// original function handler
					oldListenerAdder = arg1;
					// overwritten event listener is the wrapper function, contains orig
					overwrittenListenerAdder = arg1 = overwriteEventListener(oldListenerAdder, this, arg0);
				}

				// Calling the seter (e.g. addEventListener, setAttribute) with this
				// and the original arguments. For example, for "setTimeout('incrementCounter', 1000)"
				// as a handler, seter = setTimeout, arguments = ['overwrittenEventListener', 1000] where
				// 'overwrittenEventListener' is a wrapper containing the line incrementCounter.apply(...) 
				var toBeReturned = copyOfSetterFunction.apply(this, arguments);
				if (oldListenerAdder !== undefined) {
					arguments[indx] = oldListenerAdder;
				}
				return toBeReturned;
			}; // end of _clematisSetter();
			targetPrototype[listenerSetter] = _clematisSetter; // overwrite the original function that adds event-listeners	
		}
		return this;
	}

	function overwriteEventListener(originalEventListener, object1, eventType) {
		return function overwrittenEventListener() {
			// records the instance when an event gets dispatched
			switch (object1["originalSetter"]) {
			case "addEventListener":
				logger.logDOMEvent(eventType, this, originalEventListener);
				break;
			default:
				window.console.log("Unsupported event constructor.");
			}
            return originalEventListener.apply(this, arguments);
		};
	};
}
var _detectedBrowser = navigator.userAgent.toLowerCase();
_detectedBrowser = (_detectedBrowser.indexOf("chrome") >= 0) ? "chrome" :
	(_detectedBrowser.indexOf("firefox") >= 0) ? "firefox" :undefined;

var alreadyOverwritten = {};

/*
 * replaceListenerAdder
 *
 * Overwrites functions that register eventlisteners for a specific type of object
 */
function replaceListenerAdder(targetObjectPrototype, objectName, o) {
	if (alreadyOverwritten.hasOwnProperty(objectName)) { // Prototype (e.g. Window, Button) already added
		return objectName;
	}

	if (targetObjectPrototype.hasOwnProperty("addEventListener") || targetObjectPrototype.addEventListener instanceof Function) {
		// Replace/wrap addEventListener method
		alreadyOverwritten[objectName] = new EventListenerWrapper(targetObjectPrototype,
				"addEventListener",
		"removeEventListener");
	}
	return objectName;
};

var knownValidLevel1Events = {};
EventListenerWrapper.alreadyReplaced = {};

/*
 *  getLevel1Events
 *
 *  Get all properties for prototypes (that are used in the webpage). Then iterates through all
 *  these properties and notes those beginning with "on" (e.g. "onclick", "onhover", etc.). A list
 *  of these are saved to the knownValidLevel1Events[] array with index 'name', the 'name' of the prototype.
 *
 */
function getLevel1Events(object) {

	var k, objectName = object.constructor.name, currentProp, objectProperties, propertiesToBeReturned = [];

	// Get the object type (e.g. HTMLTableCellElement)
	if (!objectName || objectName === "Object" || objectName.length === 0) {
		objectName = object.toString();
		if (objectName.length === 0) {
			objectName = Object.getPrototypeOf(object).constructor.toString().match(/function\s*?(\w*?)\s*?\(/)[1];
		} else {
			objectName = objectName.substring(8, name.length - 1);
		}
	}

	if (knownValidLevel1Events.hasOwnProperty(objectName)) {
		// Ignores duplicates with same name (e.g. multiple HTMLTableCellElement)
		return knownValidLevel1Events[objectName];
	}

	if (_detectedBrowser !== 'firefox') { 
		// Chrome?
		objectProperties = Object.getOwnPropertyNames(object);
		
		if (!(object instanceof Node)) {
			replaceListenerAdder(Object.getPrototypeOf(object), name);
		}
	} else {
		// Firefox
		objectProperties = Object.getOwnPropertyNames(Object.getPrototypeOf(object));

		for (currentProp in object) {
			if (currentProp.indexOf('on') === 0) {
				propertiesToBeReturned.push(currentProp);
			}
		}
		replaceListenerAdder(Object.getPrototypeOf(object), name, object);
	}

	for (k = 0; k < objectProperties.length; k++) {
		currentProp = objectProperties[k];
		if (currentProp.indexOf("on") === 0 && propertiesToBeReturned.indexOf(currentProp) === -1) {
			propertiesToBeReturned.push(currentProp); 
		}
	}

	// Save to array incase this method called again on already processed object/element (cache)
	knownValidLevel1Events[name] = propertiesToBeReturned;

	return propertiesToBeReturned;
};

function generateReplacementLevel1Event(level1Event) {
	var eventType = level1Event.substring(2);
	level1Event = "_clematis" + level1Event;

	return {
		configurable: true,
		enumerable: false,
		get: function () {
			return this[level1Event];
		},
		set: function (arg0) {
			this.removeEventListener(eventType, this[level1Event], false);
			if (Object.prototype.toString.apply(arg0) === "[object Function]") {
				this.addEventListener(eventType, arg0, false);
			}
			Object.defineProperty(this, level1Event, {
				value: arg0,
				configurable: true,
				enumerable: false,
				writable: true
			});
			return arg0;
		}
	};
};

// Cache of all replacement Level 1 events
var _clematisReplacementDescriptors = {};

function overrideIndividualDOMLevel1(object) {

	// Object has already been processed
	if (object.hasOwnProperty("_clematisLevel1Replaced")) {
		return;
	}
	
	var j, singleEvent, defaultLevel1Event, validEvents = getLevel1Events(object), flag;

	for (j = 0; j < validEvents.length; j++) {
		singleEvent = validEvents[j];

		flag = object.hasOwnProperty(singleEvent);		

		defaultLevel1Event = object[singleEvent];

		if (defaultLevel1Event && singleEvent !== "onload") {
			object[singleEvent] = null;
		}
		if (! _clematisReplacementDescriptors.hasOwnProperty(singleEvent)) {
			_clematisReplacementDescriptors[singleEvent] = generateReplacementLevel1Event(singleEvent);
		}
		Object.defineProperty(object, singleEvent, _clematisReplacementDescriptors[singleEvent]);

		if (defaultLevel1Event && (Object.prototype.toString.call(defaultLevel1Event) === '[object Function]') && (defaultLevel1Event.name === singleEvent)) {
			// TODO: Not surefire way to extract actual function 
			/* [1]: function name
			 * [2]: arguments
			 * [3]: function body
			 */
			var astRoot = esprima.parse(defaultLevel1Event,  { range: true, loc: true });

			var i, newArguments, actualFunction, newBody, newFn;

			newArguments = defaultLevel1Event.toString().substring(defaultLevel1Event.toString().indexOf('(')+1,defaultLevel1Event.toString().indexOf(')'));
			newArguments = newArguments.split(',');

			// Call Expressions
			actualFunction = esmorph.modify(defaultLevel1Event.toString(), esmorph.Tracer.CallExpression(callSnapshot));

			// Return Statements
			actualFunction = esmorph.modify(actualFunction, esmorph.Tracer.ReturnStatement(returnSnapshot));

			// Function Declarations
			actualFunction = esmorph.modify(actualFunction, esmorph.Tracer.FunctionEntrance(enterSnapshot));
			actualFunction = esmorph.modify(actualFunction, esmorph.Tracer.FunctionExit(exitSnapshot));                        
			newBody = actualFunction.toString().substring(actualFunction.toString().indexOf('{')+1,actualFunction.toString().lastIndexOf('}'));
			newFn = new Function(
					"return function " + defaultLevel1Event.name + "("+newArguments.join(',')+"){"+newBody+"}"
			)();
			defaultLevel1Event = newFn;
		}
		if (defaultLevel1Event || flag) {
			object[singleEvent] = defaultLevel1Event;
		}

	}  

	Object.defineProperty(object, "_clematisLevel1Replaced", {
		value: 1,
		configurable: false,
		enumerable: false,
		writable: false
	});
	return;
};

/*  
 *	When webpage has loaded replace all listeners. Iterates through all document elements, and
 *  overwrites their original event handlers with our wrapper.
 */
document.addEventListener("DOMContentLoaded", function replaceDOMLevel1ForAll() {
	var i, allElements = document.querySelectorAll("*");

	// Removes this DOM event which was added below once all listeners have been replaced.
	this.removeEventListener("DOMContentLoaded", replaceDOMLevel1ForAll, false);

	// Gather all elements into the array all[]
	for (i = 0; i < allElements.length; i++) {
		// Overwrite/replace each element's handlers
		overrideIndividualDOMLevel1(allElements[i]);
	}
} , false);

//Call the overwrite function on the actual document, before wrapping its elements
overrideIndividualDOMLevel1(document);
overrideIndividualDOMLevel1(window);

//addEventListener() of Chrome, Safari and IE
if (_detectedBrowser === 'chrome') {
	replaceListenerAdder(Node.prototype, "Node");
} else if (_detectedBrowser === "firefox") {
	// addEventListener() of Firefox for HTML Object definitions  
	replaceListenerAdder(HTMLHtmlElement.prototype, "HTMLHtmlElement");
	replaceListenerAdder(HTMLElement.prototype, "HTMLElement");
	replaceListenerAdder(HTMLHeadElement.prototype, "HTMLHeadElement");
	replaceListenerAdder(HTMLLinkElement.prototype, "HTMLLinkElement");
	replaceListenerAdder(HTMLTitleElement.prototype, "HTMLTitleElement");
	replaceListenerAdder(HTMLMetaElement.prototype, "HTMLMetaElement");
	replaceListenerAdder(HTMLBaseElement.prototype, "HTMLBaseElement");
	replaceListenerAdder(HTMLStyleElement.prototype, "HTMLStyleElement");
	replaceListenerAdder(HTMLBodyElement.prototype, "HTMLBodyElement");
	replaceListenerAdder(HTMLFormElement.prototype, "HTMLFormElement");
	replaceListenerAdder(HTMLSelectElement.prototype, "HTMLSelectElement");
	replaceListenerAdder(HTMLOptGroupElement.prototype, "HTMLOptGroupElement");
	replaceListenerAdder(HTMLOptionElement.prototype, "HTMLOptionElement");
	replaceListenerAdder(HTMLInputElement.prototype, "HTMLInputElement");
	replaceListenerAdder(HTMLTextAreaElement.prototype, "HTMLTextAreaElement");
	replaceListenerAdder(HTMLButtonElement.prototype, "HTMLButtonElement");
	replaceListenerAdder(HTMLLabelElement.prototype, "HTMLLabelElement");
	replaceListenerAdder(HTMLFieldSetElement.prototype, "HTMLFieldSetElement");
	replaceListenerAdder(HTMLLegendElement.prototype, "HTMLLegendElement");
	replaceListenerAdder(HTMLUListElement.prototype, "HTMLUListElement");
	replaceListenerAdder(HTMLOListElement.prototype, "HTMLOListElement");
	replaceListenerAdder(HTMLDListElement.prototype, "HTMLDListElement");
	replaceListenerAdder(HTMLDirectoryElement.prototype, "HTMLDirectoryElement");
	replaceListenerAdder(HTMLMenuElement.prototype, "HTMLMenuElement");
	replaceListenerAdder(HTMLLIElement.prototype, "HTMLLIElement");
	replaceListenerAdder(HTMLDivElement.prototype, "HTMLDivElement");
	replaceListenerAdder(HTMLParagraphElement.prototype, "HTMLParagraphElement");
	replaceListenerAdder(HTMLHeadingElement.prototype, "HTMLHeadingElement");
	replaceListenerAdder(HTMLQuoteElement.prototype, "HTMLQuoteElement");
	replaceListenerAdder(HTMLPreElement.prototype, "HTMLPreElement");
	replaceListenerAdder(HTMLBRElement.prototype, "HTMLBRElement");
	replaceListenerAdder(HTMLFontElement.prototype, "HTMLFontElement");
	replaceListenerAdder(HTMLHRElement.prototype, "HTMLHRElement");
	replaceListenerAdder(HTMLModElement.prototype, "HTMLModElement");
	replaceListenerAdder(HTMLAnchorElement.prototype, "HTMLAnchorElement");
	replaceListenerAdder(HTMLImageElement.prototype, "HTMLImageElement");
	replaceListenerAdder(HTMLObjectElement.prototype, "HTMLObjectElement");
	replaceListenerAdder(HTMLParamElement.prototype, "HTMLParamElement");
	replaceListenerAdder(HTMLMapElement.prototype, "HTMLMapElement");
	replaceListenerAdder(HTMLAreaElement.prototype, "HTMLAreaElement");
	replaceListenerAdder(HTMLScriptElement.prototype, "HTMLScriptElement");
	replaceListenerAdder(HTMLTableElement.prototype, "HTMLTableElement");
	replaceListenerAdder(HTMLTableCaptionElement.prototype, "HTMLTableCaptionElement");
	replaceListenerAdder(HTMLTableColElement.prototype, "HTMLTableColElement");
	replaceListenerAdder(HTMLTableSectionElement.prototype, "HTMLTableSectionElement");
	replaceListenerAdder(HTMLTableRowElement.prototype, "HTMLTableRowElement");
	replaceListenerAdder(HTMLTableCellElement.prototype, "HTMLTableCellElement");
	replaceListenerAdder(HTMLFrameSetElement.prototype, "HTMLFrameSetElement");
	replaceListenerAdder(HTMLFrameElement.prototype, "HTMLFrameElement");
	replaceListenerAdder(HTMLIFrameElement.prototype, "HTMLIFrameElement");
	replaceListenerAdder(HTMLSpanElement.prototype, "HTMLSpanElement");

	//replaceListenerAdder(HTMLIsIndexElement.prototype, "HTMLIsIndexElement");
	//replaceListenerAdder(HTMLDivElementPrototype, "HTMLDivElement");
	//replaceListenerAdder(HTMLAppletElement.prototype, "HTMLAppletElement");
	//replaceListenerAdder(HTMLBaseFontElement.prototype, "HTMLBaseFontElement");
}