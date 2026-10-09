/**
 * Content Script - runs on all coursera.org pages
 *
 * FIX: Coursera APIs (such as onDemandVideos.v1, progressState) 
 * require authentication headers (especially X-Coursera-Application and the CSRF token)
 * to avoid 403 Forbidden. Automatic header injection is enabled.
 */

const BASE = 'https://www.coursera.org';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== UTILITIES =====

function getCsrfToken() {
  const match = document.cookie.match(/(^|;\s*)csrf3-token=([^;]+)/);
  return match ? match[2] : '';
}

/**
 * Wrapper for fetch that automatically adds Coursera's required headers.
 * Without these headers, the API (especially onDemandVideos.v1) returns 403.
 */
async function courseraFetch(url, options = {}) {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Coursera-Application': 'nautilus',
    'X-Coursera-Version': 'ondemand',
    ...options.headers,
  };
  
  if (!options.method || options.method.toUpperCase() === 'GET') {
    delete headers['Content-Type'];
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF3-Token'] = csrf;
    headers['X-CSRFToken'] = csrf;
  }

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}

function getCourseContext() {
  const match = window.location.href.match(
    /\/learn\/([^/]+)\/(lecture|supplement|quiz|programming)\/([^/?#]+)/
  );
  if (!match) return null;
  return { courseSlug: match[1], itemType: match[2], itemId: match[3] };
}

// ===== LẤY courseId VÀ userId =====

async function getCourseId(courseSlug) {
  try {
    const res = await fetch(`${BASE}/api/onDemandCourses.v1?q=slug&slug=${courseSlug}&fields=id`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const id = data?.elements?.[0]?.id ?? null;
    if (id) console.log('[CourseraSkip] courseId:', id);
    return id;
  } catch (e) {
    console.log('[CourseraSkip] getCourseId error:', e.message);
    return null;
  }
}

async function getUserId() {
  // Do not use chrome.storage.local: it caches a stale userId after switching accounts
  
  // METHOD 1: Look inside <script> tags (same technique as the original tool)
  try {
    const scripts = document.getElementsByTagName('script');
    for (const script of scripts) {
      const text = script.textContent;
      if (text && text.includes('"email_address"') && text.includes('"id"')) {
        const match = text.match(/"id"\s*:\s*(\d+)/);
        if (match && match[1]) {
          console.log('[CourseraSkip] userId from script tag:', match[1]);
          return match[1];
        }
      }
      
      // Coursera Apollo state format
      if (text && text.includes('ROOT_QUERY') && text.includes('userId')) {
        const match2 = text.match(/"userId"\s*:\s*(\d+)/);
        if (match2 && match2[1]) {
          console.log('[CourseraSkip] userId from Apollo:', match2[1]);
          return match2[1];
        }
      }
    }
  } catch (e) {
    console.log('[CourseraSkip] DOM parse error:', e);
  }

  // METHOD 2: Use the valid API with full CSRF headers
  try {
    const res = await courseraFetch(`${BASE}/api/users.v1?q=me&fields=id`);
    if (res.ok) {
      const data = await res.json();
      const userId = data?.elements?.[0]?.id ?? null;
      if (userId) {
        console.log('[CourseraSkip] userId from API:', userId);
        return userId;
      }
    }
  } catch (e) {
    console.log('[CourseraSkip] API users.v1 error:', e.message);
  }

  console.log('[CourseraSkip] Could not get userId.');
  return null;
}

// ===== API HELPERS =====


function extractVideoFromLecturePayload(data) {
  const linkedVideos = data?.linked?.['onDemandVideos.v1'];
  if (Array.isArray(linkedVideos) && linkedVideos.length > 0) {
    return linkedVideos[0];
  }
  const videoFromElement = data?.elements?.[0]?.video;
  if (videoFromElement) return videoFromElement;
  return null;
}

async function getVideoMeta(courseId, courseSlug, itemId) {
  const fields = [
    'onDemandVideos.v1(id%2Cduration%2Cname%2Csources%2Csubtitles%2CsubtitlesVtt%2CsubtitlesTxt)',
    'disableSkippingForward',
    'startMs',
    'endMs',
  ].join('%2C');

  const url = `${BASE}/api/onDemandLectureVideos.v1/${courseId}~${itemId}/?includes=video&fields=${fields}`;

  try {
    const res = await courseraFetch(url);
    console.log('[CourseraSkip] onDemandLectureVideos.v1 status:', res.status);
    if (res.ok) {
      const data = await res.json();
      const video = extractVideoFromLecturePayload(data);
      if (video) {
        let durationMs = video.duration;
        if (!durationMs) {
          try {
            const videoEl = document.querySelector('video');
            if (videoEl && videoEl.duration && isFinite(videoEl.duration)) {
              durationMs = Math.round(videoEl.duration * 1000);
            }
          } catch (e) {}
        }
        console.log('[CourseraSkip] videoId:', video.id, '| duration:', durationMs, 'ms');
        return { videoId: video.id, duration: durationMs };
      }
    }
  } catch (e) {
    console.log('[CourseraSkip] onDemandLectureVideos.v1 error:', e.message);
  }

  try {
    const videoEl = document.querySelector('video');
    if (videoEl && videoEl.duration && isFinite(videoEl.duration)) {
      const durationMs = Math.round(videoEl.duration * 1000);
      console.log('[CourseraSkip] duration from DOM video:', durationMs, 'ms');
      return { videoId: itemId, duration: durationMs };
    }
  } catch (e) {}

  return null;
}

async function reportVideoProgress(userId, courseId, videoId, duration) {
  const progressId = `${userId}~${courseId}~${videoId}`;
  const validDuration = (typeof duration === 'number' && isFinite(duration) && duration > 0) ? duration : 9999999;
  const viewedUpTo = Math.max(0, validDuration - 1000);
  console.log(`[CourseraSkip] reportProgress: viewedUpTo=${viewedUpTo}ms`);
  
  const methods = ['POST', 'PUT'];
  for (const method of methods) {
    try {
      const res = await courseraFetch(`${BASE}/api/onDemandVideoProgresses.v1/${progressId}`, {
        method: method,
        body: JSON.stringify({ viewedUpTo, videoProgressId: progressId }),
      });
      console.log(`[CourseraSkip] reportProgress (${method}) status:`, res.status);
      if (res.ok || res.status === 204) return true;
    } catch (e) {
      console.log(`[CourseraSkip] reportProgress (${method}) error:`, e.message);
    }
  }
  return false;
}

// ===== CORE LOGIC =====

async function markLectureCompleted(userId, courseId, courseSlug, itemId, isBulk = false) {
  console.log(`[CourseraSkip] === B1: Try to complete immediately (${itemId}) ===`);
  const completeUrl = `${BASE}/api/opencourse.v1/user/${userId}/course/${courseSlug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`;
  try {
    const res1 = await courseraFetch(completeUrl, {
      method: 'POST',
      body: JSON.stringify({ contentRequestBody: {} }),
    });
    console.log('[CourseraSkip] B1 complete status:', res1.status);
    if (res1.ok) return { success: true, step: 1 };

    if (res1.status === 403 || res1.status === 401) {
      return { success: false, error: `Error ${res1.status}: No permission. Make sure you are enrolled in the course.` };
    }
  } catch (e) {
    console.log('[CourseraSkip] B1 error:', e.message);
  }

  console.log('[CourseraSkip] === B2: Get video metadata ===');
  const meta = await getVideoMeta(courseId, courseSlug, itemId);

  if (!meta) {
    console.log('[CourseraSkip] No meta → Fallback PUT progressState');
    const putVariants = [
      `${BASE}/api/opencourse.v1/user/${userId}/course/${courseId}/item/${itemId}/progressState`,
      `${BASE}/api/opencourse.v1/user/${userId}/course/${courseSlug}/item/${itemId}/progressState`,
    ];
    for (const url of putVariants) {
      try {
        const fbRes = await courseraFetch(url, {
          method: 'PUT',
          body: JSON.stringify({ progressState: 'COMPLETED' }),
        });
        console.log('[CourseraSkip] Fallback PUT status:', fbRes.status);
        if (fbRes.ok) return { success: true, step: 'fallback-PUT' };
        if (fbRes.status === 403 || fbRes.status === 401) {
          return { success: false, error: `Error ${fbRes.status}: No permission (not enrolled).` };
        }
      } catch (e) {}
    }
    return { success: false, error: `Error: Could not get video meta and the fallback PUT also failed. Please reload the page.` };
  }

  console.log('[CourseraSkip] === B3: Report as nearly fully watched ===');
  const progressOk = await reportVideoProgress(userId, courseId, meta.videoId, meta.duration);

  // === B4: Same as the original code - retry actions/complete until the backend finishes processing ===
  // KEY POINT: Call videoEvents/ended instead of actions/complete
  console.log('[CourseraSkip] Retry URL:', completeUrl);
  
  const MAX_WAIT_MS = isBulk ? 20000 : 90000; // In bulk mode, wait at most 20s so the server can keep up
  const INTERVAL_MS = 3000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_WAIT_MS) {
    await sleep(INTERVAL_MS);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    try {
      const retryRes = await courseraFetch(completeUrl, {
        method: 'POST',
        body: JSON.stringify({ contentRequestBody: {} }),
      });
      console.log(`[CourseraSkip] B4 retry [${elapsed}s]: status=${retryRes.status}`);
      if (retryRes.ok) {
        return { success: true, step: 4, videoId: meta.videoId };
      }
      // 403/401 = no permission - stop immediately
      if (retryRes.status === 403 || retryRes.status === 401) {
        return { success: false, error: `Error ${retryRes.status}: No permission (not enrolled in the course?).` };
      }
      // 404 = backend has not finished processing progress yet → keep retrying
    } catch (e) {
      console.log('[CourseraSkip] B4 retry error:', e.message);
    }
  }

  // 90 seconds elapsed - progress was saved (PUT 204) but the backend has not responded yet
  if (progressOk) {
    return { success: true, step: 3, videoId: meta.videoId, message: '✅ Progress was saved but Coursera has not updated the UI yet. Try refreshing (F5) after 1 minute.' };
  }
  return { success: false, error: 'Progress report failed after 90 seconds.' };
}

async function markSupplementCompleted(userId, courseId, courseSlug, itemId) {
  console.log('[CourseraSkip] === Marking supplement as complete ===');
  try {
    const supplementUrl = `${BASE}/api/onDemandSupplementCompletions.v1`;
    const res = await courseraFetch(supplementUrl, {
      method: 'POST',
      body: JSON.stringify({
        courseId: courseId,
        itemId: itemId,
        userId: Number(userId)
      }),
    });
    
    console.log('[CourseraSkip] Supplement status:', res.status);
    if (res.ok) return { success: true };

    if (res.status === 403 || res.status === 401) {
      return { success: false, error: `Error ${res.status}: No permission. Are you enrolled?` };
    }
  } catch (e) {
    console.log('[CourseraSkip] Supplement error:', e.message);
  }

  return { success: false, error: 'Failed to report reading completion.' };
}

// ===== MAIN ORCHESTRATOR =====

async function markCurrentItemCompleted() {
  const context = getCourseContext();
  if (!context) return { success: false, error: 'Page not recognized. Open a lesson page (/learn/.../lecture/... or /supplement/...).' };

  const { courseSlug, itemType, itemId } = context;
  console.log(`[CourseraSkip] ▶ type=${itemType} | slug=${courseSlug} | item=${itemId}`);

  const courseId = await getCourseId(courseSlug);
  if (!courseId) return { success: false, error: 'Could not get courseId from the API. Coursera may have changed its API format.' };

  const userId = await getUserId(courseId);
  if (!userId) return { success: false, error: 'Could not get userId. Make sure you are logged in to Coursera.' };

  console.log(`[CourseraSkip] courseId=${courseId} | userId=${userId}`);

  if (itemType === 'lecture') {
    const result = await markLectureCompleted(userId, courseId, courseSlug, itemId);
    const suffix = result.retries ? ` (retry ×${result.retries})` : result.step === 'fallback-PUT' ? ' (fallback)' : '';
    const finalMsg = result.message || (result.success ? `✅ Video completed!${suffix}` : `❌ ${result.error}`);
    return { ...result, message: finalMsg, itemType, courseId, userId, itemId };
  }

  if (itemType === 'supplement') {
    const result = await markSupplementCompleted(userId, courseId, courseSlug, itemId);
    return { ...result, message: result.success ? `✅ Reading completed!${result.fallback ? ' (fallback)' : ''}` : `❌ ${result.error}`, itemType, courseId, userId, itemId };
  }

  return { success: false, message: `⚠️ Type "${itemType}" is not supported yet.`, itemType };
}

// ===== BULK COMPLETION =====

async function getAllCourseItems(courseSlug) {
  try {
    const includes = "modules,lessons,passableItemGroups,passableItemGroupChoices,passableLessonElements,items,tracks,gradePolicy,gradingParameters,embeddedContentMapping";
    const fields = "moduleIds,onDemandCourseMaterialModules.v1(name,slug,description,timeCommitment,lessonIds,optional,learningObjectives),onDemandCourseMaterialLessons.v1(name,slug,timeCommitment,elementIds,optional,trackId),onDemandCourseMaterialPassableItemGroups.v1(requiredPassedCount,passableItemGroupChoiceIds,trackId),onDemandCourseMaterialPassableItemGroupChoices.v1(name,description,itemIds),onDemandCourseMaterialPassableLessonElements.v1(gradingWeight,isRequiredForPassing),onDemandCourseMaterialItems.v2(name,originalName,slug,timeCommitment,contentSummary,isLocked,lockableByItem,itemLockedReasonCode,trackId,lockedStatus,itemLockSummary),onDemandCourseMaterialTracks.v1(passablesCount),onDemandGradingParameters.v1(gradedAssignmentGroups),contentAtomRelations.v1(embeddedContentSourceCourseId,subContainerId)";
    const url = `${BASE}/api/onDemandCourseMaterials.v2/?q=slug&slug=${courseSlug}&includes=${includes}&fields=${fields}&showLockedItems=true`;
    
    const res = await courseraFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    console.log('[CourseraSkip] getAllCourseItems error:', e);
    return null;
  }
}

async function markAllItemsCompleted() {
  const context = getCourseContext();
  if (!context) {
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'Course not found. Open a lesson page.' });
    return;
  }

  const { courseSlug } = context;
  chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'Loading the course content list...' });

  const material = await getAllCourseItems(courseSlug);
  if (!material || !material.linked || !material.linked['onDemandCourseMaterialItems.v2']) {
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'Could not load the course materials.' });
    return;
  }

  const items = material.linked['onDemandCourseMaterialItems.v2'].filter(
    (f) => f.contentSummary && (f.contentSummary.typeName.includes('lecture') || f.contentSummary.typeName.includes('supplement'))
  );

  const total = items.length;
  let completed = 0;
  
  if (total === 0) {
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'No videos or readings found in this course!' });
    return;
  }

  const courseId = material.elements?.[0]?.id;
  if (!courseId) {
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'Error: Could not get courseId.' });
    return;
  }

  const userId = await getUserId(courseId);
  if (!userId) {
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: 'Error: Could not get userId.' });
    return;
  }

  const batchSize = 5;
  chrome.runtime.sendMessage({ action: 'progressUpdate', message: `Starting to process ${total} items...` });

  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (item) => {
      try {
        const typeName = item.contentSummary.typeName;
        if (typeName.includes('lecture')) {
           await markLectureCompleted(userId, courseId, courseSlug, item.id, true);
        } else if (typeName.includes('supplement')) {
           await markSupplementCompleted(userId, courseId, courseSlug, item.id);
        }
      } catch (e) {
        console.log('[CourseraSkip] item error', item.id, e);
      }
    }));
    
    completed += batch.length;
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: `Processing: ${Math.min(completed, total)} / ${total} items...` });
    
    // Pause 2s between batches to avoid Coursera rate limiting
    await sleep(2000);
  }

  chrome.runtime.sendMessage({ action: 'progressUpdate', message: `✅ Completed all ${total} items! Please refresh (F5) the page.` });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'markCompleted') {
    markCurrentItemCompleted()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: `Error: ${err.message}` }));
    return true;
  }
  if (message.action === 'markAllCompleted') {
    markAllItemsCompleted();
    sendResponse({ success: true, message: "Started in the background." });
    return true;
  }
  if (message.action === 'getContext') {
    sendResponse(getCourseContext() || { error: 'Page not recognized.' });
  }
});
