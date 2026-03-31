<?php
/**
 * API Proxy — forwards /partner-api, /b2b-api, /wallet-api to backend servers.
 * Works without Apache mod_proxy. Uses cURL.
 */

// Allow CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Strip query string from URI — match only the path
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$target = null;

// Route to correct backend (Beta servers — per Shubhendu's instruction 2026-03-30)
if (preg_match('#^/partner-api/(.*)$#', $uri, $m)) {
    $target = 'https://api.betasavaari.com/partner_api/public/' . $m[1];
} elseif (preg_match('#^/b2b-api/(.*)$#', $uri, $m)) {
    $target = 'https://api23.betasavaari.com/' . $m[1];
} elseif (preg_match('#^/wallet-api/(.*)$#', $uri, $m)) {
    $target = 'https://apiext.betasavaari.com/wallet/public/' . $m[1];
} elseif (preg_match('#^/address-api/(.*)$#', $uri, $m)) {
    $target = 'https://apiext.betasavaari.com/' . $m[1];
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Unknown API route']);
    exit;
}

// Append query string (token, params, etc.) — only once
if (!empty($_SERVER['QUERY_STRING'])) {
    $target .= '?' . $_SERVER['QUERY_STRING'];
}

// Forward the request via cURL
$ch = curl_init($target);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward request headers
$forwardHeaders = [];
foreach (getallheaders() as $key => $value) {
    $lower = strtolower($key);
    if (in_array($lower, ['host', 'connection', 'accept-encoding'])) continue;
    $forwardHeaders[] = "$key: $value";
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);

// Forward request body for POST/PUT
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH'])) {
    $body = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

// Capture response headers
$responseHeaders = [];
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($ch, $header) use (&$responseHeaders) {
    $len = strlen($header);
    $parts = explode(':', $header, 2);
    if (count($parts) === 2) {
        $name = strtolower(trim($parts[0]));
        if (!in_array($name, ['transfer-encoding', 'connection', 'keep-alive', 'access-control-allow-origin'])) {
            $responseHeaders[] = trim($header);
        }
    }
    return $len;
});

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'Proxy error', 'details' => $error]);
    exit;
}

// Send response headers
foreach ($responseHeaders as $h) {
    header($h);
}

http_response_code($httpCode);
echo $response;
