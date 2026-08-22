using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace IndusDsc
{
    public static class SignPdfCms
    {
        const uint CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG = 0x00010000;
        const uint CRYPT_ACQUIRE_PREFER_NCRYPT_KEY_FLAG = 0x00020000;
        const uint CRYPT_ACQUIRE_SILENT_FLAG = 0x00000040;
        const uint CERT_NCRYPT_KEY_SPEC = 0xFFFFFFFF;
        const uint CERT_KEY_PROV_INFO_PROP_ID = 2;
        const int BCRYPT_PAD_PKCS1 = 2;
        const int NTE_KEYSET_NOT_DEF = unchecked((int)0x80090019);

        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CryptAcquireCertificatePrivateKey(
            IntPtr pCertContext,
            uint dwFlags,
            IntPtr pvParameters,
            out IntPtr phCryptProvOrNCryptKey,
            out uint pdwKeySpec,
            out bool pfCallerFreeProvOrNCryptKey);

        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CertGetCertificateContextProperty(
            IntPtr pCertContext,
            uint dwPropId,
            IntPtr pvData,
            ref uint pcbData);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptReleaseContext(IntPtr hProv, uint dwFlags);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptAcquireContext(out IntPtr hProv, string container, string provider, uint provType, uint flags);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetProvParam(IntPtr hProv, uint dwParam, byte[] pbData, ref int pdwDataLen, uint dwFlags);

        [DllImport("advapi32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        static extern bool CryptSetProvParam(IntPtr hProv, uint dwParam, byte[] pbData, uint dwFlags);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetUserKey(IntPtr hProv, uint dwKeySpec, out IntPtr hKey);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptDestroyKey(IntPtr hKey);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetKeyParam(IntPtr hKey, uint dwParam, byte[] pbData, ref int pdwDataLen, uint dwFlags);

        const uint PROV_RSA_FULL = 1;
        const uint CRYPT_VERIFYCONTEXT = 0xF0000000;
        const uint CRYPT_SILENT = 0x00000040;
        const uint PP_ENUMCONTAINERS = 2;
        const uint PP_KEYEXCHANGE_PIN = 32;
        const uint PP_SIGNATURE_PIN = 33;
        const uint CRYPT_FIRST = 1;
        const uint CRYPT_NEXT = 2;
        const uint AT_KEYEXCHANGE = 1;
        const uint AT_SIGNATURE = 2;
        const uint KP_CERTIFICATE = 26;

        [DllImport("ncrypt.dll")]
        static extern int NCryptFreeObject(IntPtr hObject);

        [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
        static extern int NCryptSetProperty(IntPtr hObject, string pszProperty, byte[] pbInput, int cbInput, int dwFlags);

        [DllImport("ncrypt.dll")]
        static extern int NCryptSignHash(
            IntPtr hKey,
            IntPtr pPaddingInfo,
            byte[] pbHashValue,
            int cbHashValue,
            byte[] pbSignature,
            int cbSignature,
            out int pcbResult,
            int dwFlags);

        [StructLayout(LayoutKind.Sequential)]
        struct CRYPT_KEY_PROV_INFO
        {
            public IntPtr pwszContainerName;
            public IntPtr pwszProvName;
            public int dwProvType;
            public uint dwFlags;
            public uint cProvParam;
            public IntPtr rgProvParam;
            public int dwKeySpec;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct BCRYPT_PKCS1_PADDING_INFO
        {
            public IntPtr pszAlgId;
        }

        public static void SignDetached(string thumbprint, string inputPath, string outputPath, string pin)
        {
            var thumb = NormalizeThumbprint(thumbprint);
            if (thumb.Length == 0) throw new ArgumentException("Missing certificate thumbprint.");
            var data = File.ReadAllBytes(inputPath);
            string storeDiag;
            var cert = FindCertificateInStores(thumb, out storeDiag);
            if (cert != null)
            {
                using (var token = OpenTokenSigner(cert, pin))
                {
                    File.WriteAllBytes(outputPath, BuildDetachedCms(cert, data, token));
                }
                return;
            }

            // Apply/list can show certs from the USB CSP that are not (yet) in Cert:\CurrentUser\My.
            CspCertHit hit;
            if (TryFindCertificateOnTokenCsp(thumb, pin, out hit))
            {
                using (var token = OpenCspTokenSigner(hit.Provider, hit.Container, pin))
                {
                    File.WriteAllBytes(outputPath, BuildDetachedCms(hit.Cert, data, token));
                }
                return;
            }

            throw new InvalidOperationException(BuildCertNotFoundMessage(thumb, storeDiag, pin));
        }

        static string NormalizeThumbprint(string thumbprint)
        {
            if (string.IsNullOrWhiteSpace(thumbprint)) return "";
            var sb = new StringBuilder(thumbprint.Length);
            foreach (var ch in thumbprint)
            {
                if ((ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f'))
                    sb.Append(char.ToUpperInvariant(ch));
            }
            return sb.ToString();
        }

        static string ThumbOf(X509Certificate2 cert)
        {
            return NormalizeThumbprint(cert != null ? cert.Thumbprint : null);
        }

        struct CspCertHit
        {
            public X509Certificate2 Cert;
            public string Provider;
            public string Container;
        }

        static X509Certificate2 FindCertificateInStores(string thumb, out string diag)
        {
            var seen = new List<string>();
            foreach (StoreLocation loc in new[] { StoreLocation.CurrentUser, StoreLocation.LocalMachine })
            {
                try
                {
                    using (var store = new X509Store(StoreName.My, loc))
                    {
                        store.Open(OpenFlags.ReadOnly);
                        foreach (X509Certificate2 cert in store.Certificates)
                        {
                            var t = ThumbOf(cert);
                            if (t.Length == 0) continue;
                            if (seen.Count < 12 && !seen.Contains(t)) seen.Add(t);
                            if (string.Equals(t, thumb, StringComparison.Ordinal))
                            {
                                diag = loc == StoreLocation.CurrentUser ? "Cert:\\CurrentUser\\My" : "Cert:\\LocalMachine\\My";
                                return cert;
                            }
                        }
                        // Also try the framework finder (some stores need it).
                        var matches = store.Certificates.Find(X509FindType.FindByThumbprint, thumb, false);
                        if (matches.Count > 0)
                        {
                            diag = loc == StoreLocation.CurrentUser ? "Cert:\\CurrentUser\\My" : "Cert:\\LocalMachine\\My";
                            return matches[0];
                        }
                    }
                }
                catch (CryptographicException)
                {
                    /* LocalMachine may be restricted; continue */
                }
            }
            diag = seen.Count == 0
                ? "no_certs_in_CurrentUser_or_LocalMachine_My"
                : ("store_thumbs=" + string.Join(",", seen.ToArray()));
            return null;
        }

        static bool TryFindCertificateOnTokenCsp(string thumb, string pin, out CspCertHit hit)
        {
            hit = default(CspCertHit);
            var providers = new[]
            {
                "HyperPKI HYP2003 CSP India v3.0",
                "HyperPKI HYP2003 CSP V1.0"
                // Skip Microsoft Base Smart Card — triggers Hypersecu "drivers not present" UI.
            };
            foreach (var provider in providers)
            {
                foreach (var container in EnumProviderContainers(provider, pin))
                {
                    X509Certificate2 cert;
                    if (!TryReadContainerCertificate(provider, container, pin, out cert) || cert == null)
                        continue;
                    if (!string.Equals(ThumbOf(cert), thumb, StringComparison.Ordinal))
                        continue;
                    hit = new CspCertHit { Cert = cert, Provider = provider, Container = container };
                    return true;
                }
            }
            return false;
        }

        static List<string> EnumProviderContainers(string provider, string pin)
        {
            var names = new List<string>();
            IntPtr hProv;
            if (!CryptAcquireContext(out hProv, null, provider, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT))
                return names;
            try
            {
                if (!string.IsNullOrEmpty(pin))
                {
                    var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                    CryptSetProvParam(hProv, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                    CryptSetProvParam(hProv, PP_SIGNATURE_PIN, pinBytes, 0);
                }
                uint flag = CRYPT_FIRST;
                while (true)
                {
                    int len = 1024;
                    var buf = new byte[len];
                    if (!CryptGetProvParam(hProv, PP_ENUMCONTAINERS, buf, ref len, flag)) break;
                    int n = Array.IndexOf(buf, (byte)0);
                    if (n < 0) n = Math.Max(0, len);
                    var name = Encoding.ASCII.GetString(buf, 0, n).Trim('\0', ' ');
                    if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
                    flag = CRYPT_NEXT;
                }
            }
            finally { CryptReleaseContext(hProv, 0); }
            return names;
        }

        static bool TryReadContainerCertificate(string provider, string container, string pin, out X509Certificate2 cert)
        {
            cert = null;
            IntPtr hProv;
            if (!CryptAcquireContext(out hProv, container, provider, PROV_RSA_FULL, 0)
                && !CryptAcquireContext(out hProv, container, provider, PROV_RSA_FULL, CRYPT_SILENT))
                return false;
            try
            {
                if (!string.IsNullOrEmpty(pin))
                {
                    var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                    CryptSetProvParam(hProv, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                    CryptSetProvParam(hProv, PP_SIGNATURE_PIN, pinBytes, 0);
                }
                foreach (var spec in new uint[] { AT_SIGNATURE, AT_KEYEXCHANGE })
                {
                    IntPtr hKey;
                    if (!CryptGetUserKey(hProv, spec, out hKey)) continue;
                    try
                    {
                        int len = 0;
                        CryptGetKeyParam(hKey, KP_CERTIFICATE, null, ref len, 0);
                        if (len <= 0) continue;
                        var der = new byte[len];
                        if (!CryptGetKeyParam(hKey, KP_CERTIFICATE, der, ref len, 0)) continue;
                        cert = new X509Certificate2(der);
                        return true;
                    }
                    catch { }
                    finally { CryptDestroyKey(hKey); }
                }
            }
            finally { CryptReleaseContext(hProv, 0); }
            return false;
        }

        static TokenSigner OpenCspTokenSigner(string provider, string container, string pin)
        {
            var got = TryOpenCspContainer(provider, container, pin, "", false);
            if (got != null) return got;
            throw new InvalidOperationException(
                "Certificate was found on the USB token CSP (" + provider + ") but the private key could not be opened. "
                + "Plug the token in, unlock it in HyperPKI Manager with the PIN, then try Download again.");
        }

        static string BuildCertNotFoundMessage(string thumb, string storeDiag, string pin)
        {
            var user = Environment.UserName ?? "";
            var sessionHint = "Signer Windows user=" + user + ".";
            if (string.IsNullOrEmpty(pin))
            {
                return "[stale_or_token_only_thumbprint] Requested thumbprint " + thumb
                    + " was not in Cert:\\CurrentUser\\My or Cert:\\LocalMachine\\My (" + storeDiag + "). "
                    + sessionHint
                    + " Enter the token PIN and click Refresh/Sign again so the live USB certificate is used, then Download. "
                    + "If Apply listed this cert from the token only, Save again after Sign so dsc_thumbprint matches the plugged-in token.";
            }
            if (storeDiag != null && storeDiag.StartsWith("store_thumbs=", StringComparison.Ordinal))
            {
                return "[stale_thumbprint] Requested thumbprint " + thumb
                    + " is not among the certificates in the Windows personal store (" + storeDiag + "). "
                    + sessionHint
                    + " Open Edit DSC, Sign with the certificate currently on the token, Save, then Download.";
            }
            if (storeDiag == "no_certs_in_CurrentUser_or_LocalMachine_My")
            {
                return "[store_path_or_session] No certificates in Cert:\\CurrentUser\\My or Cert:\\LocalMachine\\My for Windows user "
                    + user
                    + ". Plug in the token and open HyperPKI Manager (log in with PIN). "
                    + "If Windows says the smart card requires drivers that are not present, repair HyperPKI HYP2003 India v3.0, then Edit DSC → Refresh → Sign → Save → Download.";
            }
            return "[cert_not_found] Certificate thumbprint " + thumb
                + " was not found in the Windows personal store or on the USB token CSP (" + storeDiag + "). "
                + sessionHint
                + " Plug the token in, unlock it, Sign again, then Download.";
        }

        // FindCertificate removed — SignDetached resolves Cert:\CurrentUser\My, Cert:\LocalMachine\My, then HyperPKI CSP.

        sealed class TokenSigner : IDisposable
        {
            public RSA Rsa;
            public IntPtr NCryptKey;
            public bool FreeNCrypt;

            public byte[] SignSha256(byte[] data)
            {
                if (Rsa != null)
                    return Rsa.SignData(data, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                if (NCryptKey != IntPtr.Zero)
                    return SignWithNCrypt(NCryptKey, data);
                throw new InvalidOperationException("USB DSC private key handle is missing.");
            }

            public void Dispose()
            {
                if (Rsa != null)
                {
                    Rsa.Dispose();
                    Rsa = null;
                }
                if (FreeNCrypt && NCryptKey != IntPtr.Zero)
                {
                    NCryptFreeObject(NCryptKey);
                    NCryptKey = IntPtr.Zero;
                }
            }
        }

        static string PrivateKeyOpenError(int err, X509Certificate2 cert)
        {
            var info = ReadKeyProvInfo(cert.Handle);
            var provider = info.HasValue ? (info.Value.ProviderName ?? "") : "";
            if (provider.IndexOf("HyperPKI", StringComparison.OrdinalIgnoreCase) >= 0
                && provider.IndexOf("India", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "This DSC certificate needs HyperPKI HYP2003 CSP India v3.0, but that CSP is not available to Windows. "
                    + "Install/repair the eMudhra HyperPKI (India v3.0) package, open HyperPKI Manager, plug in the token, enter the PIN, then try Download again. "
                    + "Installed HyperPKI V1.0 alone cannot open this key.";
            }
            if (err == NTE_KEYSET_NOT_DEF || err == -2146893799)
            {
                return "Windows could not open the USB DSC private key (keyset not defined). "
                    + "Plug the token in, start HyperPKI Certd/Manager, enter the PIN, and try Download again. "
                    + "If this continues, install or repair the Hypersecu/eMudhra CSP that matches the certificate.";
            }
            return "Windows could not open the USB DSC private key (Win32 " + err + "). "
                + "Plug the token in, start HyperPKI, enter the PIN, and try Download again.";
        }

        static TokenSigner TryAcquirePrivateKey(X509Certificate2 cert, string pin, bool silent)
        {
            IntPtr handle;
            uint keySpec;
            bool freeHandle;
            uint flags = CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG | CRYPT_ACQUIRE_PREFER_NCRYPT_KEY_FLAG;
            if (silent) flags |= CRYPT_ACQUIRE_SILENT_FLAG;
            if (!CryptAcquireCertificatePrivateKey(cert.Handle, flags, IntPtr.Zero, out handle, out keySpec, out freeHandle))
                return null;
            return FinishAcquiredKey(cert, pin, handle, keySpec, freeHandle);
        }

        static TokenSigner OpenTokenSigner(X509Certificate2 cert, string pin)
        {
            // Prefer opening through the certificate's own CSP/container (HyperPKI India, etc.).
            var fromProv = OpenFromKeyProvInfo(cert, pin);
            if (fromProv != null) return fromProv;

            try
            {
                var rsa = RSACertificateExtensions.GetRSAPrivateKey(cert);
                if (rsa != null)
                {
                    ApplyPin(rsa, pin);
                    return new TokenSigner { Rsa = rsa };
                }
            }
            catch (CryptographicException)
            {
                /* store cert often has HasPrivateKey=true with a dead container */
            }

            // Interactive first so Windows/HyperPKI can prompt for PIN when needed.
            var acquired = TryAcquirePrivateKey(cert, pin, false);
            if (acquired != null) return acquired;

            int err = Marshal.GetLastWin32Error();

            // If the UI path failed and a PIN was supplied, retry silent with that PIN applied after acquire.
            if (!string.IsNullOrWhiteSpace(pin))
            {
                acquired = TryAcquirePrivateKey(cert, pin, true);
                if (acquired != null) return acquired;
                err = Marshal.GetLastWin32Error();
            }

            var smartCard = OpenSmartCardCsp(cert, pin);
            if (smartCard != null) return smartCard;

            // Last resort: remap known HyperPKI India provider name to the installed V1.0 CSP.
            var aliased = OpenHyperPkiAlias(cert, pin);
            if (aliased != null) return aliased;

            throw new InvalidOperationException(PrivateKeyOpenError(err, cert));
        }

        static TokenSigner OpenFromKeyProvInfo(X509Certificate2 cert, string pin)
        {
            var info = ReadKeyProvInfo(cert.Handle);
            if (!info.HasValue || string.IsNullOrEmpty(info.Value.ContainerName))
                return null;

            var providers = new List<string>();
            if (!string.IsNullOrEmpty(info.Value.ProviderName))
                providers.Add(info.Value.ProviderName);
            // eMudhra India DSC often stores "… India v3.0" while only "… V1.0" is registered.
            if (info.Value.ProviderName != null
                && info.Value.ProviderName.IndexOf("HyperPKI", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                providers.Add("HyperPKI HYP2003 CSP V1.0");
                providers.Add("HyperPKI HYP2003 CSP India v3.0");
            }

            foreach (var provider in providers)
            {
                var got = TryOpenCspContainer(provider, info.Value.ContainerName, pin, (cert.Thumbprint ?? "").Replace(" ", "").ToUpperInvariant(), false);
                if (got != null) return got;
            }
            return null;
        }

        static TokenSigner OpenHyperPkiAlias(X509Certificate2 cert, string pin)
        {
            var info = ReadKeyProvInfo(cert.Handle);
            if (!info.HasValue || string.IsNullOrEmpty(info.Value.ContainerName)) return null;
            if (info.Value.ProviderName == null
                || info.Value.ProviderName.IndexOf("HyperPKI", StringComparison.OrdinalIgnoreCase) < 0)
                return null;
            return TryOpenCspContainer(
                "HyperPKI HYP2003 CSP V1.0",
                info.Value.ContainerName,
                pin,
                (cert.Thumbprint ?? "").Replace(" ", "").ToUpperInvariant(),
                false);
        }

        static TokenSigner OpenSmartCardCsp(X509Certificate2 cert, string pin)
        {
            const string provider = "Microsoft Base Smart Card Crypto Provider";
            var thumb = (cert.Thumbprint ?? "").Replace(" ", "").ToUpperInvariant();
            var fromDefault = TryOpenCspContainer(provider, null, pin, thumb, true);
            if (fromDefault != null) return fromDefault;

            IntPtr hProv;
            if (!CryptAcquireContext(out hProv, null, provider, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT))
                return null;
            try
            {
                foreach (var container in EnumSmartCardContainers(hProv))
                {
                    var got = TryOpenCspContainer(provider, container, pin, thumb, false);
                    if (got != null) return got;
                }
            }
            finally { CryptReleaseContext(hProv, 0); }
            return null;
        }

        static List<string> EnumSmartCardContainers(IntPtr hProv)
        {
            var names = new List<string>();
            uint flag = CRYPT_FIRST;
            while (true)
            {
                int len = 1024;
                var buf = new byte[len];
                if (!CryptGetProvParam(hProv, PP_ENUMCONTAINERS, buf, ref len, flag)) break;
                int n = Array.IndexOf(buf, (byte)0);
                if (n < 0) n = Math.Max(0, len);
                var name = Encoding.ASCII.GetString(buf, 0, n).Trim('\0', ' ');
                if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
                flag = CRYPT_NEXT;
            }
            return names;
        }

        static bool ContainerMatchesCert(IntPtr hProv, string thumb)
        {
            foreach (var spec in new uint[] { AT_SIGNATURE, AT_KEYEXCHANGE })
            {
                IntPtr hKey;
                if (!CryptGetUserKey(hProv, spec, out hKey)) continue;
                try
                {
                    int len = 0;
                    CryptGetKeyParam(hKey, KP_CERTIFICATE, null, ref len, 0);
                    if (len <= 0) continue;
                    var der = new byte[len];
                    if (!CryptGetKeyParam(hKey, KP_CERTIFICATE, der, ref len, 0)) continue;
                    var other = new X509Certificate2(der);
                    if (string.Equals((other.Thumbprint ?? "").Replace(" ", ""), thumb, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch { }
                finally { CryptDestroyKey(hKey); }
            }
            return false;
        }

        static TokenSigner TryOpenCspContainer(string provider, string container, string pin, string thumb, bool useDefault)
        {
            try
            {
                IntPtr hProv;
                // Prefer interactive open so HyperPKI can show its PIN dialog when needed.
                if (!CryptAcquireContext(out hProv, useDefault ? null : container, provider, PROV_RSA_FULL, 0))
                {
                    uint silentFlags = CRYPT_SILENT;
                    if (!CryptAcquireContext(out hProv, useDefault ? null : container, provider, PROV_RSA_FULL, silentFlags))
                        return null;
                }
                try
                {
                    if (!string.IsNullOrEmpty(pin))
                    {
                        var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                        CryptSetProvParam(hProv, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                        CryptSetProvParam(hProv, PP_SIGNATURE_PIN, pinBytes, 0);
                    }
                    // When we already have the cert's exact container, still verify when possible,
                    // but do not abort if KP_CERTIFICATE is unavailable on this CSP.
                    if (!string.IsNullOrEmpty(thumb) && !ContainerMatchesCert(hProv, thumb))
                    {
                        IntPtr probe;
                        bool hasSig = CryptGetUserKey(hProv, AT_SIGNATURE, out probe);
                        if (hasSig) CryptDestroyKey(probe);
                        bool hasEx = CryptGetUserKey(hProv, AT_KEYEXCHANGE, out probe);
                        if (hasEx) CryptDestroyKey(probe);
                        if (!hasSig && !hasEx) return null;
                    }
                }
                finally { CryptReleaseContext(hProv, 0); }

                var csp = new CspParameters(1, provider);
                if (useDefault)
                    csp.Flags = CspProviderFlags.UseDefaultKeyContainer;
                else
                {
                    csp.KeyContainerName = container;
                    csp.Flags = CspProviderFlags.UseExistingKey;
                }
                var rsa = new RSACryptoServiceProvider(csp);
                rsa.PersistKeyInCsp = false;
                return new TokenSigner { Rsa = rsa };
            }
            catch (CryptographicException)
            {
                return null;
            }
        }

        static TokenSigner FinishAcquiredKey(X509Certificate2 cert, string pin, IntPtr handle, uint keySpec, bool freeHandle)
        {

            if (keySpec == CERT_NCRYPT_KEY_SPEC)
            {
                ApplyPinToNCrypt(handle, pin);
                return new TokenSigner { NCryptKey = handle, FreeNCrypt = freeHandle };
            }

            var info = ReadKeyProvInfo(cert.Handle);
            if (info.HasValue && !string.IsNullOrEmpty(info.Value.ContainerName))
            {
                if (freeHandle && handle != IntPtr.Zero) CryptReleaseContext(handle, 0);
                var csp = new CspParameters
                {
                    ProviderName = info.Value.ProviderName,
                    KeyContainerName = info.Value.ContainerName,
                    ProviderType = info.Value.ProviderType,
                    KeyNumber = info.Value.KeySpec,
                    Flags = CspProviderFlags.UseExistingKey
                };
                try
                {
                    return new TokenSigner { Rsa = new RSACryptoServiceProvider(csp) };
                }
                catch (CryptographicException ex)
                {
                    throw new InvalidOperationException(
                        "Windows could not use the USB token key container. " + ex.Message, ex);
                }
            }

            if (freeHandle && handle != IntPtr.Zero) CryptReleaseContext(handle, 0);
            throw new InvalidOperationException(
                "The USB token private key could not be opened. Install/start the token manufacturer software and try Download again.");
        }

        static void ApplyPin(RSA rsa, string pin)
        {
            if (string.IsNullOrWhiteSpace(pin)) return;
            try
            {
                var cng = rsa as RSACng;
                if (cng == null || cng.Key == null) return;
                var pinBytes = Encoding.Unicode.GetBytes(pin + "\0");
                cng.Key.SetProperty(new CngProperty("SmartCardPin", pinBytes, CngPropertyOptions.None));
            }
            catch { }
        }

        static void ApplyPinToNCrypt(IntPtr hKey, string pin)
        {
            if (string.IsNullOrWhiteSpace(pin) || hKey == IntPtr.Zero) return;
            try
            {
                var pinBytes = Encoding.Unicode.GetBytes(pin + "\0");
                NCryptSetProperty(hKey, "SmartCardPin", pinBytes, pinBytes.Length, 0);
            }
            catch { }
        }

        static byte[] SignWithNCrypt(IntPtr hKey, byte[] data)
        {
            var hash = SHA256.Create().ComputeHash(data);
            var alg = Marshal.StringToHGlobalUni("SHA256");
            var padPtr = IntPtr.Zero;
            try
            {
                var pad = new BCRYPT_PKCS1_PADDING_INFO { pszAlgId = alg };
                padPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(BCRYPT_PKCS1_PADDING_INFO)));
                Marshal.StructureToPtr(pad, padPtr, false);
                int cb;
                int status = NCryptSignHash(hKey, padPtr, hash, hash.Length, null, 0, out cb, BCRYPT_PAD_PKCS1);
                if (status != 0 && cb <= 0)
                    throw new InvalidOperationException("USB token signing failed (NCrypt " + status + "). Enter the token PIN if asked.");
                var sig = new byte[Math.Max(cb, 256)];
                status = NCryptSignHash(hKey, padPtr, hash, hash.Length, sig, sig.Length, out cb, BCRYPT_PAD_PKCS1);
                if (status != 0)
                    throw new InvalidOperationException("USB token signing failed (NCrypt " + status + "). Plug in the token and complete the PIN prompt.");
                if (cb != sig.Length)
                {
                    var trimmed = new byte[cb];
                    Buffer.BlockCopy(sig, 0, trimmed, 0, cb);
                    return trimmed;
                }
                return sig;
            }
            finally
            {
                if (padPtr != IntPtr.Zero) Marshal.FreeHGlobal(padPtr);
                Marshal.FreeHGlobal(alg);
            }
        }

        struct ProvInfo
        {
            public string ProviderName;
            public string ContainerName;
            public int ProviderType;
            public int KeySpec;
        }

        static ProvInfo? ReadKeyProvInfo(IntPtr certHandle)
        {
            uint size = 0;
            if (!CertGetCertificateContextProperty(certHandle, CERT_KEY_PROV_INFO_PROP_ID, IntPtr.Zero, ref size) || size == 0)
                return null;
            var buf = Marshal.AllocHGlobal((int)size);
            try
            {
                if (!CertGetCertificateContextProperty(certHandle, CERT_KEY_PROV_INFO_PROP_ID, buf, ref size))
                    return null;
                var native = (CRYPT_KEY_PROV_INFO)Marshal.PtrToStructure(buf, typeof(CRYPT_KEY_PROV_INFO));
                return new ProvInfo
                {
                    ProviderName = Marshal.PtrToStringUni(native.pwszProvName) ?? "",
                    ContainerName = Marshal.PtrToStringUni(native.pwszContainerName) ?? "",
                    ProviderType = native.dwProvType,
                    KeySpec = native.dwKeySpec
                };
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        static byte[] BuildDetachedCms(X509Certificate2 cert, byte[] data, TokenSigner token)
        {
            var digest = SHA256.Create().ComputeHash(data);
            var contentTypeOid = OidBytes("1.2.840.113549.1.9.3");
            var messageDigestOid = OidBytes("1.2.840.113549.1.9.4");
            var dataOid = OidBytes("1.2.840.113549.1.7.1");
            var sha256Oid = OidBytes("192.168.1.3.192.168.1.4.1");
            var rsaOid = OidBytes("1.2.840.113549.1.1.1");
            var signedDataOid = OidBytes("1.2.840.113549.1.7.2");

            var attrContentType = Seq(contentTypeOid, Set(dataOid));
            var attrMessageDigest = Seq(messageDigestOid, Set(Octet(digest)));
            var signedAttrsSet = Set(attrContentType, attrMessageDigest);
            var signature = token.SignSha256(signedAttrsSet);

            var digestAlg = Seq(sha256Oid, new byte[] { 0x05, 0x00 });
            var sigAlg = Seq(rsaOid, new byte[] { 0x05, 0x00 });
            var issuerAndSerial = Seq(cert.IssuerName.RawData, IntegerUnsigned(SerialBigEndian(cert)));
            var signedAttrsContext = Context(0, true, Concat(attrContentType, attrMessageDigest));

            var signerInfo = Seq(
                Integer(1),
                issuerAndSerial,
                digestAlg,
                signedAttrsContext,
                sigAlg,
                Octet(signature)
            );

            var econtentInfo = Seq(dataOid);
            var certsContext = Context(0, true, cert.RawData);
            var signedData = Seq(
                Integer(1),
                Set(digestAlg),
                econtentInfo,
                certsContext,
                Set(signerInfo)
            );

            return Seq(signedDataOid, Context(0, true, signedData));
        }

        static byte[] SerialBigEndian(X509Certificate2 cert)
        {
            var serial = cert.GetSerialNumber();
            Array.Reverse(serial);
            int i = 0;
            while (i < serial.Length - 1 && serial[i] == 0) i++;
            if (i == 0) return serial;
            var trimmed = new byte[serial.Length - i];
            Buffer.BlockCopy(serial, i, trimmed, 0, trimmed.Length);
            return trimmed;
        }

        static byte[] OidBytes(string oid)
        {
            return CryptoConfig.EncodeOID(new Oid(oid).Value);
        }

        static byte[] Integer(int value)
        {
            if (value == 0) return new byte[] { 0x02, 0x01, 0x00 };
            if (value < 0x80) return new byte[] { 0x02, 0x01, (byte)value };
            return new byte[] { 0x02, 0x02, (byte)(value >> 8), (byte)value };
        }

        static byte[] IntegerUnsigned(byte[] bigEndian)
        {
            var body = bigEndian;
            if (body.Length == 0) body = new byte[] { 0 };
            if ((body[0] & 0x80) != 0)
            {
                var padded = new byte[body.Length + 1];
                Buffer.BlockCopy(body, 0, padded, 1, body.Length);
                body = padded;
            }
            return Tag(0x02, body);
        }

        static byte[] Octet(byte[] data) { return Tag(0x04, data); }
        static byte[] Seq(params byte[][] parts) { return Tag(0x30, Concat(parts)); }
        static byte[] Set(params byte[][] parts) { return Tag(0x31, Concat(parts)); }

        static byte[] Context(int n, bool constructed, byte[] inner)
        {
            byte tag = (byte)((constructed ? 0xA0 : 0x80) | n);
            return Tag(tag, inner);
        }

        static byte[] Concat(params byte[][] parts)
        {
            int len = 0;
            foreach (var p in parts) len += p.Length;
            var all = new byte[len];
            int o = 0;
            foreach (var p in parts)
            {
                Buffer.BlockCopy(p, 0, all, o, p.Length);
                o += p.Length;
            }
            return all;
        }

        static byte[] Tag(byte tag, byte[] body)
        {
            byte[] len = EncodeLength(body.Length);
            var result = new byte[1 + len.Length + body.Length];
            result[0] = tag;
            Buffer.BlockCopy(len, 0, result, 1, len.Length);
            Buffer.BlockCopy(body, 0, result, 1 + len.Length, body.Length);
            return result;
        }

        static byte[] EncodeLength(int length)
        {
            if (length < 0x80) return new byte[] { (byte)length };
            if (length <= 0xFF) return new byte[] { 0x81, (byte)length };
            if (length <= 0xFFFF) return new byte[] { 0x82, (byte)(length >> 8), (byte)length };
            return new byte[] { 0x83, (byte)(length >> 16), (byte)(length >> 8), (byte)length };
        }
    }
}
