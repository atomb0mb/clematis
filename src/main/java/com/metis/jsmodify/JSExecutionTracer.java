/*
    Automatic JavaScript Invariants is a plugin for Crawljax that can be
    used to derive JavaScript invariants automatically and use them for
    regressions testing.
    Copyright (C) 2010  crawljax.com

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

 */
package com.metis.jsmodify;

import java.io.File;
import java.io.IOException;
import java.io.PrintStream;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.logging.Logger;

import org.codehaus.jackson.JsonFactory;
//import org.codehaus.jackson.map.ObjectMapper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import com.crawljax.util.Helper;
import com.fasterxml.jackson.datatype.guava.GuavaModule;
import com.metis.core.trace.TraceObject;

import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.guava.GuavaModule;
import com.google.common.collect.Multimap;
import com.google.common.collect.TreeMultimap;


/**
 * Crawljax Plugin that reads an instrumentation array from the webbrowser and
 * saves the contents in a Daikon trace file.
 * 
 * @author Frank Groeneveld
 * @version $Id: JSExecutionTracer.java 6162 2009-12-16 13:56:21Z frank $
 */
public class JSExecutionTracer {

	private static final int ONE_SEC = 1000;

	private static String outputFolder;
	private static String traceFilename;

	private static JSONArray points = new JSONArray();

	private static final Logger LOGGER = Logger
			.getLogger(JSExecutionTracer.class.getName());

	public static final String FUNCTIONTRACEDIRECTORY = "functiontrace/";

	private static PrintStream output;

	private static ArrayList<TraceObject> traceObjects;

	/**
	 * @param filename
	 * 
	 */
	public JSExecutionTracer(String filename) {
		traceFilename = filename;
		traceObjects = new ArrayList<TraceObject>();
	}

	/**
	 * Initialize the plugin and create folders if needed.
	 * 
	 * @param browser
	 *            The browser.
	 */
	public void preCrawling() {
		try {
			Helper.directoryCheck(getOutputFolder());
			output = new PrintStream(getOutputFolder() + getFilename());
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

	/**
	 * Retrieves the JavaScript instrumentation array from the webbrowser and
	 * writes its contents in Daikon format to a file.
	 * 
	 * @param session
	 *            The crawling session.
	 * @param candidateElements
	 *            The candidate clickable elements.
	 */

	public void preStateCrawling() {

		String filename = getOutputFolder() + FUNCTIONTRACEDIRECTORY
				+ "jstrace-";

		DateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmmss");
		Date date = new Date();
		filename += dateFormat.format(date) + ".dtrace";

		try {

			LOGGER.info("Reading execution trace");

			LOGGER.info("Parsing JavaScript execution trace");

			// session.getBrowser().executeJavaScript("sendReally();");
			Thread.sleep(ONE_SEC);

			LOGGER.info("Saved execution trace as " + filename);

		} catch (Exception e) {
			e.printStackTrace();
		}
	}

	/**
	 * Get a list with all trace files in the executiontracedirectory.
	 * 
	 * @return The list.
	 */
	public List<String> allTraceFiles() {
		ArrayList<String> result = new ArrayList<String>();

		/* find all trace files in the trace directory */
		File dir = new File(getOutputFolder() + FUNCTIONTRACEDIRECTORY);

		String[] files = dir.list();
		if (files == null) {
			return result;
		}
		for (String file : files) {
			if (file.endsWith(".dtrace")) {
				result.add(getOutputFolder() + FUNCTIONTRACEDIRECTORY + file);
			}
		}

		return result;
	}

	public void postCrawling() {
		try {
			/* close the output file */
			output.close();

			extraxtTraceObjects();
		} catch (Exception e) {
			e.printStackTrace();
		}
	}

	/**
	 * This method parses the JSON file containing the trace objects and
	 * extracts the objects
	 */
	private void extraxtTraceObjects() {
		try {
			ObjectMapper mapper = new ObjectMapper();
			// Register the module that serializes the Guava Multimap
			mapper.registerModule(new GuavaModule());

			// TODO THIS IS JUST AN EXAMPLE
			// REMOVE THIS STRING LATER AND READ FROM JSON FILE
		    String serializedForm = "{\"FunctionCall\":[{\"@class\":\"com.metis.core.trace.FunctionCall\",\"lineNo\": 1,\"messageType\": \"FUNCTION_CALL\",\"targetFunction\":\"getElementById\",\"timeStamp\": {\"day\": 6,\"hour\": 23,\"minute\": 26,\"month\": 1,\"ms\": 542,\"second\": 59,\"year\": 2013}}]}";
			
		    Multimap<String, TraceObject> traceMap = mapper.<Multimap<String, TraceObject>>readValue(serializedForm, new TypeReference<TreeMultimap<String, TraceObject>>() {});

/*			File file = new File("metis-output/ftrace/function.trace");

			JsonFactory jsonFactory = new JsonFactory();

			for (Iterator<TraceObject> it = mapper.readValues(
					jsonFactory.createJsonParser(file), TraceObject.class); it
					.hasNext();) {
				TraceObject to = it.next();
				traceObjects.add(to);
				System.out
						.println(to.getMessageType() + " - " + to.getLineNo());
			}
	*/	} catch (Exception e) {
			e.printStackTrace();
		}

	}

	/**
	 * @return Name of the file.
	 */
	public static String getFilename() {
		return traceFilename;
	}

	public static String getOutputFolder() {
		return Helper.addFolderSlashIfNeeded(outputFolder);
	}

	public void setOutputFolder(String absolutePath) {
		outputFolder = absolutePath;
	}

	/**
	 * Dirty way to save program points from the proxy request threads. TODO:
	 * Frank, find cleaner way.
	 * 
	 * @param string
	 *            The JSON-text to save.
	 */
	public static void addPoint(String string) {
		JSONArray buffer = null;
		JSONObject targetAttributes = null;
		JSONObject targetElement = null;

		try {
			/* save the current System.out for later usage */
			PrintStream oldOut = System.out;
			/* redirect it to the file */
			System.setOut(output);

			buffer = new JSONArray(string);
			for (int i = 0; i < buffer.length(); i++) {
				points.put(buffer.getJSONObject(i));

				if (buffer.getJSONObject(i).has("targetElement")) {
					JSONArray extractedArray = new JSONArray(buffer
							.getJSONObject(i).get("targetElement").toString());

					targetElement = new JSONObject(
							"{\"elementType\":\"TABLE\",\"attributes\":\"asdasd\"}");

					try {
						targetAttributes = extractedArray.getJSONObject(1);
						String targetType = extractedArray.get(0).toString();

						targetElement = new JSONObject("{\"elementType\":\""
								+ targetType + "\",\"attributes\":"
								+ targetAttributes.toString() + "}");

					} catch (Exception e) {
						// targetElement is not usual DOM element
						// E.g. DOMContentLoadedA
						if (buffer.getJSONObject(i).has("eventType")
								&& buffer.getJSONObject(i).get("eventType")
										.toString().contains("ContentLoaded")) {
							targetElement = new JSONObject(
									"{\"elementType\":\"DOCUMENT\",\"attributes\":\"-\"}");
						} else {
							targetElement = new JSONObject(
									"{\"elementType\":\"UNKNOWN\",\"attributes\":\"-\"}");
						}
					}
					buffer.getJSONObject(i).remove("targetElement");
					buffer.getJSONObject(i).put("targetElement", targetElement);
				}

				System.out.println(buffer.getJSONObject(i).toString(2));
			}

			/* Restore the old system.out */
			System.setOut(oldOut);

		} catch (JSONException e) {
			e.printStackTrace();
		}

	}

}
