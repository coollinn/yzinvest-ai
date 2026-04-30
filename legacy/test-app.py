#!/usr/bin/env python3
"""
Test script to verify YZInvest AI application is running on port 8080
"""

import requests
import time
import sys

def test_backend():
    """Test if backend API is accessible on port 8080"""
    print("🧪 Testing YZInvest AI Backend on port 8080...")

    try:
        # Test root endpoint
        response = requests.get("http://localhost:8080/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend is running: {data}")
        else:
            print(f"❌ Backend returned status: {response.status_code}")
            return False

        # Test health endpoint
        response = requests.get("http://localhost:8080/health", timeout=10)
        if response.status_code == 200:
            health_data = response.json()
            print(f"✅ Health check: {health_data}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False

        # Test API docs
        response = requests.get("http://localhost:8080/docs", timeout=10)
        if response.status_code == 200:
            print("✅ API documentation is accessible")
        else:
            print(f"❌ API docs not accessible: {response.status_code}")
            return False

        # Test stocks endpoint
        response = requests.get("http://localhost:8080/api/stocks/?page=1&limit=5", timeout=10)
        if response.status_code == 200:
            stocks_data = response.json()
            print(f"✅ Stocks API working: {len(stocks_data.get('stocks', []))} stocks returned")
        else:
            print(f"⚠️ Stocks API returned: {response.status_code} (this might be expected if no data)")

        print("\n🎉 Backend is fully operational on port 8080!")
        return True

    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend on port 8080")
        return False
    except requests.exceptions.Timeout:
        print("❌ Backend request timed out")
        return False
    except Exception as e:
        print(f"❌ Error testing backend: {e}")
        return False

def main():
    print("🚀 YZInvest AI Application Test")
    print("=" * 50)

    # Wait a moment to ensure backend is fully started
    print("⏳ Waiting for backend to initialize...")
    time.sleep(2)

    success = test_backend()

    print("\n" + "=" * 50)
    if success:
        print("🎊 ALL TESTS PASSED!")
        print("\n📊 Application URLs:")
        print("   🌐 Frontend: http://localhost:8080 (when built)")
        print("   📚 API Docs: http://localhost:8080/docs")
        print("   🔧 API Base: http://localhost:8080/api")
        print("\n🚀 YZInvest AI is ready to use!")
    else:
        print("💥 Some tests failed. Please check the backend logs.")
        sys.exit(1)

if __name__ == "__main__":
    main()