<?php
/**
 * Registration API Proxy — forwards /reg-api/* to api.alphasavaari.com/*.
 *
 * Separate from proxy.php (which is server-managed and must NOT be overwritten).
 * This file handles ONLY registration-related endpoints:
 *   - POST /partner_api/public/otp/sms/send
 *   - POST /partner_api/public/otp/sms/verify
 *   - POST /partner_api/public/otp/email/send
 *   - POST /partner_api/public/otp/email/verify
 *   - POST /partner_api/public/general/gst_verification.php
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (!preg_match('#^/reg-api/(.*)$#', $uri, $m)) {
    http_response_code(404);
    echo json_encode(['error' => 'Invalid registration API route']);
    exit;
}

$target = 'https://api.alphasavaari.com/' . $m[1];

if (!empty($_SERVER['QUERY_STRING'])) {
    $target .= '?' . $_SERVER['QUERY_STRING'];
}

$ch = curl_init($target);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

$forwardHeaders = [];
foreach (getallheaders() as $key => $value) {
    $lower = strtolower($key);
    if (in_array($lower, ['host', 'connection', 'accept-encoding'])) continue;
    $forwardHeaders[] = "$key: $value";
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH'])) {
    $body = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

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
    echo json_encode(['error' => 'Registration proxy error', 'details' => $error]);
    exit;
}

foreach ($responseHeaders as $h) {
    header($h);
}

http_response_code($httpCode);
echo $response;
