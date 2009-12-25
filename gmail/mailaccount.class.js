/*
  MailAccount class
  by Anders Sahlin a.k.a. destructoBOT (malakeen@gmail.com)
  for Google Mail Checker Plus
  http://chrome.google.com/extensions/detail/gffjhibehnempbkeheiccaincokdjbfe
*/
function MailAccount(domain) {
  // Check global settings
  var pollInterval = localStorage["gc_poll"];
  var requestTimeout = 10000;
  var openInTab = (localStorage["gc_open_tabs"] != null && localStorage["gc_open_tabs"] == "true");
  var archiveAsRead = (localStorage["gc_archive_read"] != null && localStorage["gc_archive_read"] == "true");
  var mailURL = (localStorage["gc_force_ssl"] != null && localStorage["gc_force_ssl"] == "true") ? "https://" : "http://";
  mailURL += "mail.google.com";
  mailURL += (domain != null) ? "/a/" + domain + "/" : "/mail/";
  logToConsole(mailURL);    
  var inboxLabel;
  var atomLabel;
  var unreadLabel;
  
  if(localStorage["gc_check_all"] == null || localStorage["gc_check_all"] == "false") {
    inboxLabel = "#inbox";
    unreadLabel = "#inbox";
    atomLabel = "";
  } else {
    inboxLabel = "#all";
    unreadLabel = "#search/l:unread";
    atomLabel = "unread";
  }
  
  var mailArray;
  var unreadCount = -1;
  var mailTitle;
  var abortTimerId;
  var gmailAt = null;
  var errorLives = 3;
  var isStopped = false;
  var requestTimer;
  
  this.onUpdate;
  this.onError;
  this.isDefault;
  
  // Debug output
  var verbose = true;
  
  // Without this/that, no internal calls to onUpdate or onError can be made...
  var that = this;
  
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function(){
    logToConsole("readystate: " + this.readyState);
    if (this.readyState == 4 && this.status == 200) {
      if (this.responseXML) {
	var xmlDoc = this.responseXML;
	var fullCount = Number(xmlDoc.getElementsByTagName("fullcount")[0].textContent);
	mailTitle = xmlDoc.getElementsByTagName("title")[0].textContent;
        mailTitle = mailTitle.replace("Gmail - ", "");
	mailArray = new Array();
        
	if (fullCount > 0) {
	  // One or more unread emails, parse and store them!
	  var mailEntries = xmlDoc.getElementsByTagName("entry");
	  
	  // Iterate through all the mail entry nodes
	  for(var i = 0; i < fullCount; i++) {
	    try {
	      var entry = mailEntries[i];
	      var title = entry.getElementsByTagName("title")[0].textContent;
	      var summary = entry.getElementsByTagName("summary")[0].textContent;
	      var link = entry.getElementsByTagName("link")[0].attributes.getNamedItem("href").value;
	      var issued = entry.getElementsByTagName("issued")[0].textContent;
	      var authorName = entry.getElementsByTagName("name")[0].textContent;
	      var authorMail = entry.getElementsByTagName("email")[0].textContent;
	      var id = link.replace(/.*message_id=(\d\w*).*/, "$1");
	      
	      if(title == null || title.length < 1)
		title = "(No subject)";
	      
	      /*if(summary != null && (title.length + summary.length) > 100) {
		summary += "<span class=\"lowerright\">[<a href=\"javascript:getThread('" + id + "');\" title=\"View entire message\">more</a>]</span>";
		}   */                            
	      
	      // Construct mail object and store in the mail array
	      mailArray.push({
		"id" : id,
		"title" : title,
		"summary" : summary,
		"link" : link,
		"issued" : issued,
		"authorName" : authorName,
		"authorMail" : authorMail
	      });
	    } catch(e) { 
	      console.error(e); 
	    }
	  }
	}

	delete xmlDoc;
	//delete this.responseXML;
	//delete this.responseText;
	this.responseXML = null;
	this.responseText = null;
	xmlDoc = null;
	
	handleSuccess(fullCount);
      } else {
	logToConsole("No XML response! Check Gmail!");
	handleError();
      }
    } else if(this.readyState == 4 && this.status == 401) {
      logToConsole("You are not logged in!");
      handleError();        
    }
  }
  xhr.onerror = function(error) {
    logToConsole("error: " + error);
    //handleError();
  }
  
  // Handles a successful getInboxCount call and schedules a new one
  function handleSuccess(count) {
    logToConsole("success!");
    window.clearTimeout(abortTimerId);
    errorLives = 3;
    updateUnreadCount(count);
    //scheduleRequest(); 
  }
  
  // Handles a unsuccessful getInboxCount call and schedules a new one
  function handleError() {
    logToConsole("error!");
    window.clearTimeout(abortTimerId);
    errorLives--;
    if(errorLives <= 0)
      setLoggedOutState();
    //scheduleRequest();
  }
  
  // Retreives inbox count and populates mail array
  function getInboxCount() {
    abortTimerId = window.setTimeout(function() {
      if(xhr != null) {
	xhr.abort();
	handleError();
      }
    }, requestTimeout);

    try {
      logToConsole("requesting " + mailURL + "feed/atom/" + atomLabel);
      xhr.open("GET", mailURL + "feed/atom/" + atomLabel, true);
      xhr.send(null);
      
      if(gmailAt == null) {
	getAt();
      }
    } catch(e) {
      console.error("exception: " + e);
      handleError();
    }
  }
  
  // Schedules a new getInboxCount call
  function scheduleRequest(interval) {
    if(isStopped) {
      return;
    }
    
    logToConsole("scheduling new request");
    
    if(interval != null) {
      window.setTimeout(getInboxCount, interval);
    } else {
      requestTimer = window.setTimeout(getInboxCount, pollInterval);
      window.setTimeout(scheduleRequest, pollInterval);
    }
  }
  
  // Updates unread count and calls onUpdate event
  function updateUnreadCount(count) {
    if (unreadCount != count) {  
      unreadCount = count;   
      logToConsole("unread count: " + unreadCount);
      
      if(that.onUpdate != null) {
	try {
	  logToConsole("trying to call onUpdate...");
	  that.onUpdate(that);
	}
	catch (e) { 
	  console.error(e);
	}
      }
    }
  }
  
  // Calls onError and resets data
  function setLoggedOutState() {
    if(that.onError != null) {
      try {
	logToConsole("trying to call onError...");
	that.onError(that);
      }
      catch (e) { 
	console.error(e);
      }
    }
    
    unreadCount = -1;
    mailArray = null;
  }
  
  function logToConsole(text) {
    if(verbose)
      console.log(text);
  }
  
  // Send a POST action to Gmail
  function postAction(postObj) {
    if(gmailAt == null) {
      getAt(postAction, postObj);
    } else {		
      var threadid = postObj.threadid;
      var action = postObj.action;
      
      var postURL = mailURL.replace("http:", "https:");
      postURL += "h/" + Math.ceil(1000000*Math.random()) + "/";
      var postParams = "t=" + threadid + "&at=" + gmailAt + "&act=" + action;
      
      logToConsole(postURL);
      logToConsole(postParams);
      
      var postXHR = new XMLHttpRequest();
      postXHR.onreadystatechange = function(){
	if (this.readyState == 4 && this.status == 200) {
	  // Post successful! Refresh once
	  window.setTimeout(getInboxCount, 0);
	} else if(this.readyState == 4 && this.status == 401) {
	  
	}
      }
      postXHR.onerror = function(error) {
	logToConsole("mark as read error: " + error);
      }
      
      postXHR.open("POST", postURL, true);
      postXHR.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      postXHR.send(postParams);
    }
  }
  
  // Opens the basic HTML version of Gmail and fetches the Gmail_AT value needed for POST's
  function getAt(callback, tag) {
    var getURL = mailURL + "h/" + Math.ceil(1000000*Math.random()) + "/?ui=html&zy=c";				
    var gat_xhr = new XMLHttpRequest();
    gat_xhr.onreadystatechange = function(){
      if (this.readyState == 4 && this.status == 200) {
	//logToConsole(this.responseText);
	var matches = this.responseText.match(/\?at=([^"]+)/);
	//logToConsole(matches);
	if(matches.length > 0) {
	  gmailAt = matches[1];
	  //logToConsole(gmailAt);
	  
	  if(callback != null) {
	    callback(tag);
	  }
	}
      } else if(this.readyState == 4 && this.status == 401) {
        
      }
    }
    gat_xhr.onerror = function(error) {
      logToConsole("get gmail_at error: " + error);
    }		
    gat_xhr.open("GET", getURL, true);
    gat_xhr.send(null);		
  }
  
  /* Public methods */
  
  // Starts the scheduler
  this.startScheduler = function() {
    logToConsole("starting scheduler...");
    getInboxCount();
    scheduleRequest();
  }
  
  // Stops the scheduler
  this.stopScheduler = function() {
    logToConsole("stopping scheduler...");
    isStopped = true;
    
    if(requestTimer != null) {
      window.clearTimeout(requestTimer);
    }
    
    delete that;
  }
  
  // Opens the inbox
  this.openInbox = function() {        
    // See if there is any Gmail tab open
    chrome.tabs.getAllInWindow(null, function tabSearch(tabs) {
      for(var i in tabs) {
	var tab = tabs[i];
	if(tab.url.indexOf(mailURL) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	} else if(tab.url.indexOf(mailURL.replace("http:", "https:")) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	} else if(tab.url.indexOf(mailURL.replace("https:", "http:")) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	}
      }
      chrome.tabs.create({url: mailURL + inboxLabel});
    });
  }
  // Opens unread label
  this.openUnread = function() {        
    // See if there is any Gmail tab open
    chrome.tabs.getAllInWindow(null, function tabSearch(tabs) {
      for(var i in tabs) {
	var tab = tabs[i];
	if(tab.url.indexOf(mailURL) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	} else if(tab.url.indexOf(mailURL.replace("http:", "https:")) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	} else if(tab.url.indexOf(mailURL.replace("https:", "http:")) >= 0) {
	  chrome.tabs.update(tab.id, {selected:true});
	  return;
	}
      }
      chrome.tabs.create({url: mailURL + unreadLabel});
    });
  }
  // Opens a thread
  this.openThread = function(threadid) {        
    if(threadid != null) {
      chrome.tabs.create({url: mailURL + inboxLabel + "/" + threadid});
      postAction({"threadid":threadid, "action":"rd"});
      scheduleRequest(1000);
    }
  }
  // Fetches content of thread
  this.getThread = function(threadid, callback) {
    if(threadid != null) {
      var getURL = mailURL + "h/" + Math.ceil(1000000*Math.random()) + "/?v=pt&th=" + threadid;				
      var gt_xhr = new XMLHttpRequest();
      gt_xhr.onreadystatechange = function(){
	if (this.readyState == 4 && this.status == 200) {
	  that.readThread(threadid);
	  var matches = this.responseText.match(/<hr>[\s\S]?<table[^>]*>([\s\S]*?)<\/table>(?=[\s\S]?<hr>)/gi);
	  //var matches = matchRecursiveRegExp(this.responseText, "<div class=[\"]?msg[\"]?>", "</div>", "gi")
	  //logToConsole(this.responseText);
	  //logToConsole(matches[matches.length - 1]);
	  //logToConsole(matches);
	  if(matches != null && matches.length > 0) {
	    var threadbody = matches[matches.length - 1];
            threadbody = threadbody.replace(/<tr>[\s\S]*?<tr>/, "");
            threadbody = threadbody.replace(/<td colspan="?2"?>[\s\S]*?<td colspan="?2"?>/, "");
	    threadbody = threadbody.replace(/cellpadding="?12"?/g, "");
	    threadbody = threadbody.replace(/font size="?-1"?/g, 'font');
	    threadbody = threadbody.replace(/<hr>/g, "");
	    threadbody = threadbody.replace(/(href="?)\/mail\//g, "$1" + mailURL);
	    threadbody = threadbody.replace(/(src="?)\/mail\//g, "$1" + mailURL);
	    //threadbody += "<span class=\"lowerright\">[<a href=\"javascript:showReply('" + threadid + "');\" title=\"Write quick reply\">reply</a>]&nbsp;[<a href=\"javascript:hideBody('" + threadid + "');\" title=\"Show summary\">less</a>]</span>";
	    logToConsole(threadbody);
	    if(callback != null) {
	      callback(threadid, threadbody);
	    }
	  }
	} else if(this.readyState == 4 && this.status == 401) {
	  
	}
      }
      gt_xhr.onerror = function(error) {
	logToConsole("get thread error: " + error);
      }		
      gt_xhr.open("GET", getURL, true);
      gt_xhr.send(null);				
    }		
  }

  // Posts a reply to a thread
  this.replyToThread = function(replyObj) {
    if(gmailAt == null) {
      getAt(that.replyToThread, replyObj);
    } else {		
      var threadid = replyObj.id;
      var reply = escape(replyObj.body);
      var callback = replyObj.callback;
      
      var postURL = mailURL + "h/" + Math.ceil(1000000*Math.random()) + "/" + "?v=b&qrt=n&fv=cv&rm=12553ee9085c11ca&at=xn3j33xxbkqkoyej1zgstnt6zkxb1c&pv=cv&th=12553ee9085c11ca&cs=qfnq";
      var postParams = /*"v=b&qrt=n&fv=cv&rm=12553ee9085c11ca&at=xn3j33xxbkqkoyej1zgstnt6zkxb1c&pv=cv&th=12553ee9085c11ca&cs=qfnq" +
			 "&th=" + threadid + "&at=" + gmailAt +*/ "body=" + reply;
      
      logToConsole(postParams);
      
      var postXHR = new XMLHttpRequest();
      postXHR.onreadystatechange = function(){
	if (this.readyState == 4 && this.status == 200) {
	  // Reply successful! Fire callback
	  // callback();
	} else if(this.readyState == 4 && this.status == 401) {
	  
	}
      }
      postXHR.onerror = function(error) {
	logToConsole("reply to thread error: " + error);
      }
      
      postXHR.open("POST", postURL, true);
      postXHR.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      postXHR.send(postParams);
    }		
  }
  
  // Marks a thread as read
  this.readThread = function(threadid) {
    if(threadid != null) {
      postAction({"threadid":threadid, "action":"rd"});
    }		
  }
  
  // Marks a thread as read
  this.unreadThread = function(threadid) {
    if(threadid != null) {
      postAction({"threadid":threadid, "action":"ur"});
    }		
  }
  
  // Archives a thread
  this.archiveThread = function(threadid) {
    if(threadid != null) {
      postAction({"threadid":threadid, "action":"arch"});
      if(archiveAsRead) {
        postAction({"threadid":threadid, "action":"rd"});
      }
    }		
  }
  
  // Deletes a thread
  this.deleteThread = function(threadid) {
    if(threadid != null) {
      postAction({"threadid":threadid, "action":"tr"});
    }		
  }
  
  // Deletes a thread
  this.spamThread = function(threadid) {
    if(threadid != null) {
      postAction({"threadid":threadid, "action":"sp"});
    }		
  }
  
  // Retrieves unread count
  this.getUnreadCount = function() {
    return Number(unreadCount);
  }
  
  // Returns the "Gmail - Inbox for..." link
  this.getInboxLink = function() {
    return mailTitle;
  }
  
  // Returns the mail array
  this.getMail = function() {
    return mailArray;
  }
  
  // Returns the mail URL
  this.getURL = function() {
    return mailURL;
  }
  
  // Returns the mail array
  this.refreshInbox = function() {
    window.setTimeout(getInboxCount, 0);
  }
  
  // Opens the Compose window
  this.composeNew = function() {        
    if(openInTab) {
      chrome.tabs.create({url: mailURL + "?view=cm&fs=1&tf=1"});
    } else {
      chrome.windows.create({url: mailURL + "?view=cm&fs=1&tf=1"});
    }
  }
  
  // Opens the Compose window with pre-filled data
  this.replyTo = function(mail) {
    var to = encodeURIComponent(mail.authorMail); // Escape sender email
    var subject = encodeURIComponent(mail.title); // Escape subject string
    subject = (subject.search(/^Re: /i) > -1) ? subject : "Re: " + subject; // Add 'Re: ' if not already there
    var replyURL = mailURL + "?view=cm&fs=1&tf=1&to=" + to + "&su=" + subject;
    if(openInTab) {
      chrome.tabs.create({url: replyURL});
    } else {
      chrome.windows.create({url: replyURL});
    }
  }
  
  // No idea, actually...
  function NSResolver(prefix) {
    if(prefix == 'gmail') {
      return 'http://purl.org/atom/ns#';
    }
  }
  
  // Called when the user updates a tab
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status == 'loading' && tab.url.indexOf(mailURL) == 0) {
      logToConsole("saw gmail! updating...");
      window.setTimeout(getInboxCount, 0);
    }
  });
}