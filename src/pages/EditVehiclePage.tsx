// import { useState, useEffect, FormEvent } from "react";
// import { useParams, useNavigate, Link } from "react-router-dom";
// import { useVehicle, useUpdateVehicle } from "../api"; // Assuming a new useVehicle hook for a single vehicle
// import { VehicleUpdate as VehicleUpdatePayload } from "../types";
// import { toast } from "sonner";

// // UI Components
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Skeleton } from "@/components/ui/skeleton";
// import { Label } from "@/components/ui/label";
// import { Separator } from "@/components/ui/separator";
// import {
//   Breadcrumb,
//   BreadcrumbItem,
//   BreadcrumbLink,
//   BreadcrumbList,
//   BreadcrumbPage,
//   BreadcrumbSeparator,
// } from "@/components/ui/breadcrumb";

// // Icons
// import { AlertTriangle, Edit, Loader2, Save, XCircle, Gauge, CalendarDays } from "lucide-react";

// // This interface is still useful for managing the form's string-based state
// interface VehicleFormData {
//   make: string;
//   model: string;
//   year: string;
//   vin: string;
//   initial_mileage: string;
//   acquisition_date: string;
// }

// export function EditVehiclePage() {
//   const { vehicleId } = useParams<{ vehicleId: string }>();
//   const navigate = useNavigate();

//   // A crucial change: fetch ONLY the single vehicle we need, not the whole list.
//   // This requires a new function in your api.ts: `getVehicleById`.
//   const { data: vehicle, isLoading, isError, error: queryError } = useVehicle(vehicleId);

//   // The mutation hook is already set up well.
//   const updateVehicleMutation = useUpdateVehicle();

//   // Form state remains the same.
//   const [formData, setFormData] = useState<VehicleFormData>({
//     make: "",
//     model: "",
//     year: "",
//     vin: "",
//     initial_mileage: "",
//     acquisition_date: "",
//   });

//   // State for validation errors coming from the backend onError callback.
//   const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

//   // Effect to populate the form once React Query has fetched the data.
//   useEffect(() => {
//     if (vehicle) {
//       setFormData({
//         make: vehicle.make,
//         model: vehicle.model,
//         year: vehicle.year ? String(vehicle.year) : "",
//         vin: vehicle.vin || "",
//         initial_mileage: vehicle.initial_mileage?.toString() || "",
//         acquisition_date: vehicle.acquisition_date || "",
//       });
//     }
//   }, [vehicle]); // This effect runs whenever the `vehicle` data from the query changes.

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const { name, value } = e.target;
//     setFormData((prev) => ({ ...prev, [name]: value }));
//     if (validationErrors[name]) {
//       setValidationErrors((prev) => {
//         const newErrors = { ...prev };
//         delete newErrors[name];
//         return newErrors;
//       });
//     }
//   };

//   const handleSubmit = (e: FormEvent) => {
//     // No longer needs to be async
//     e.preventDefault();
//     setValidationErrors({}); // Clear old validation errors on new submit

//     // --- Payload Preparation and Client-side Validation ---
//     const payload: VehicleUpdatePayload = {
//       make: formData.make.trim(),
//       model: formData.model.trim(),
//       year: formData.year ? parseInt(formData.year, 10) : undefined,
//       vin: formData.vin.trim() || undefined,
//       initial_mileage: formData.initial_mileage.trim() === "" ? null : parseInt(formData.initial_mileage, 10),
//       acquisition_date: formData.acquisition_date.trim() === "" ? null : formData.acquisition_date,
//     };

//     // More robust "no changes" check by comparing with original data
//     let changesMade = false;
//     (Object.keys(payload) as Array<keyof VehicleUpdatePayload>).forEach((key) => {
//       const payloadValue = payload[key] ?? null; // Normalize undefined to null for comparison
//       const vehicleValue = vehicle?.[key] ?? null;
//       if (payloadValue !== vehicleValue) {
//         changesMade = true;
//       }
//     });

//     if (!changesMade) {
//       toast.info("No changes detected to save.");
//       return;
//     }

//     if (!vehicleId) return; // Should be covered by useParams, but good practice

//     // --- Call the mutation ---
//     updateVehicleMutation.mutate(
//       { id: Number(vehicleId), vehicleData: payload },
//       {
//         onSuccess: (updatedVehicle) => {
//           // You can access the returned data here
//           toast.success(` "${updatedVehicle.make} ${updatedVehicle.model}" updated!`);
//           navigate(`/vehicles/${vehicleId}/maintenance`);
//         },
//         onError: (error: any) => {
//           const errorResponse = error?.response;
//           const generalErrorMsg = "Failed to update vehicle. Please try again.";

//           if (errorResponse?.status === 422 && errorResponse?.data?.detail) {
//             toast.error("Validation failed. Please check the fields below.");
//             const backendErrors: Record<string, string[]> = {};
//             errorResponse.data.detail.forEach((detail: any) => {
//               const fieldKey = detail.loc.length > 1 ? detail.loc[1] : "general";
//               if (!backendErrors[fieldKey]) backendErrors[fieldKey] = [];
//               backendErrors[fieldKey].push(detail.msg);
//             });
//             setValidationErrors(backendErrors);
//           } else {
//             toast.error(errorResponse?.data?.detail || generalErrorMsg);
//           }
//         },
//       }
//     );
//   };

//   const getFieldError = (fieldName: keyof VehicleFormData): string | undefined => {
//     return validationErrors[fieldName]?.join(", ");
//   };

//   if (isLoading) {
//     // Return Skeleton loader for the form
//     return (
//       <div className="py-4 md:py-6 max-w-lg mx-auto animate-pulse">
//         <Skeleton className="h-6 w-3/4 mb-4" />
//         <Card>
//           <CardHeader>
//             <div className="flex items-center gap-3 mb-1">
//               <Skeleton className="h-7 w-7 rounded-full" />
//               <Skeleton className="h-7 w-48" />
//             </div>
//             <Skeleton className="h-4 w-64" />
//           </CardHeader>
//           <CardContent className="space-y-6">
//             {[1, 2, 3, 4].map((i) => (
//               <div key={i} className="space-y-1.5">
//                 <Skeleton className="h-4 w-1/4" />
//                 <Skeleton className="h-10 w-full" />
//               </div>
//             ))}
//           </CardContent>
//           <CardFooter className="flex justify-end gap-2 border-t px-6 py-4">
//             <Skeleton className="h-10 w-24" />
//             <Skeleton className="h-10 w-32" />
//           </CardFooter>
//         </Card>
//       </div>
//     );
//   }

//   if (isError) {
//     // Handle the case where the initial fetch fails (e.g., 404 Not Found)
//     const errorMsg = (queryError as any)?.response?.data?.detail || "Failed to load vehicle data.";
//     return (
//       <div className="p-4 md:p-6 max-w-md mx-auto">
//         <Alert variant="destructive" className="mt-10">
//           <AlertTriangle className="h-4 w-4" />
//           <AlertTitle>Error Loading Vehicle</AlertTitle>
//           <AlertDescription>{errorMsg}</AlertDescription>
//         </Alert>
//         <Button onClick={() => navigate("/vehicles")} variant="outline" className="mt-4 w-full">
//           Back to Vehicles List
//         </Button>
//       </div>
//     );
//   }

//   // This check is important after loading is finished but before rendering the form
//   if (!vehicle) {
//     return <div>Vehicle not found.</div>;
//   }

//   // JSX for the form (very similar to AddVehiclePage, but title is "Edit Vehicle")
//   return (
//     <div className="p-4 md:p-6 max-w-lg mx-auto">
//       <Breadcrumb className="mb-6">
//         <BreadcrumbList>
//           <BreadcrumbItem>
//             <BreadcrumbLink asChild>
//               <Link to="/vehicles">Vehicles</Link>
//             </BreadcrumbLink>
//           </BreadcrumbItem>
//           <BreadcrumbSeparator />
//           <BreadcrumbItem>
//             <BreadcrumbLink asChild>
//               <Link to={`/vehicles/${vehicleId}/maintenance`}>{vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle"}</Link>
//             </BreadcrumbLink>
//           </BreadcrumbItem>
//           <BreadcrumbSeparator />
//           <BreadcrumbItem>
//             <BreadcrumbPage>Edit Vehicle</BreadcrumbPage>
//           </BreadcrumbItem>
//         </BreadcrumbList>
//       </Breadcrumb>
//       <Card className="pb-0">
//         <CardHeader>
//           <div className="flex items-center gap-3 mb-1">
//             <Edit className="h-7 w-7 text-primary" />
//             <CardTitle className="text-2xl">Edit Vehicle</CardTitle>
//           </div>
//           <CardDescription>
//             Update the details for: {vehicle.make} {vehicle.model}
//           </CardDescription>
//         </CardHeader>
//         <form onSubmit={handleSubmit}>
//           <CardContent className="space-y-5">
//             {updateVehicleMutation.isError && !Object.keys(validationErrors).length && (
//               <Alert variant="destructive" className="mb-4">
//                 <AlertTriangle className="h-4 w-4" />
//                 <AlertTitle>Update Error</AlertTitle>
//                 <AlertDescription>
//                   {(updateVehicleMutation.error as any)?.response?.data?.detail || "An unexpected error occurred."}
//                 </AlertDescription>
//               </Alert>
//             )}
//             <div className="space-y-1.5">
//               <Label htmlFor="make">Make *</Label>
//               <Input
//                 id="make"
//                 name="make"
//                 placeholder="e.g., Toyota"
//                 value={formData.make}
//                 onChange={handleChange}
//                 aria-invalid={!!getFieldError("make")}
//               />
//               {getFieldError("make") && <p className="text-xs text-destructive pt-1">{getFieldError("make")}</p>}
//             </div>
//             <div className="space-y-1.5">
//               <Label htmlFor="model">Model *</Label>
//               <Input
//                 id="model"
//                 name="model"
//                 placeholder="e.g., Camry"
//                 value={formData.model}
//                 onChange={handleChange}
//                 aria-invalid={!!getFieldError("model")}
//               />
//               {getFieldError("model") && <p className="text-xs text-destructive pt-1">{getFieldError("model")}</p>}
//             </div>
//             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//               <div className="space-y-1.5">
//                 <Label htmlFor="year">Year</Label>
//                 <Input
//                   id="year"
//                   name="year"
//                   type="number"
//                   placeholder="e.g., 2015"
//                   value={formData.year}
//                   onChange={handleChange}
//                   min="1886"
//                   max={new Date().getFullYear() + 1}
//                   aria-invalid={!!getFieldError("year")}
//                 />
//                 {getFieldError("year") && <p className="text-xs text-destructive pt-1">{getFieldError("year")}</p>}
//               </div>
//               <div className="space-y-1.5">
//                 <Label htmlFor="vin">VIN</Label>
//                 <Input
//                   id="vin"
//                   name="vin"
//                   placeholder="11-17 characters"
//                   value={formData.vin}
//                   onChange={handleChange}
//                   minLength={11}
//                   maxLength={17}
//                   aria-invalid={!!getFieldError("vin")}
//                 />
//                 {getFieldError("vin") && <p className="text-xs text-destructive pt-1">{getFieldError("vin")}</p>}
//               </div>
//             </div>

//             <Separator className="my-6" />

//             {/* NEW FIELDS FOR INITIAL STATE */}
//             <div>
//               <h3 className="text-lg font-medium text-foreground mb-3">
//                 Initial Vehicle State <span className="text-sm text-muted-foreground">(Optional)</span>
//               </h3>
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                 <div className="space-y-1.5">
//                   <Label htmlFor="initial_mileage">Initial Mileage (at acquisition)</Label>
//                   <div className="relative">
//                     <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//                     <Input
//                       id="initial_mileage"
//                       name="initial_mileage"
//                       type="number"
//                       placeholder="e.g., 15000"
//                       value={formData.initial_mileage}
//                       onChange={handleChange}
//                       min="0"
//                       className="pl-9"
//                       aria-invalid={!!getFieldError("initial_mileage")}
//                     />
//                   </div>
//                   {getFieldError("initial_mileage") && <p className="text-xs text-destructive pt-1">{getFieldError("initial_mileage")}</p>}
//                 </div>
//                 <div className="space-y-1.5">
//                   <Label htmlFor="acquisition_date">Acquisition Date</Label>
//                   <div className="relative">
//                     <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//                     <Input
//                       id="acquisition_date"
//                       name="acquisition_date"
//                       type="date" // Use date input type
//                       value={formData.acquisition_date}
//                       onChange={handleChange}
//                       className="pl-9"
//                       aria-invalid={!!getFieldError("acquisition_date")}
//                     />
//                   </div>
//                   {getFieldError("acquisition_date") && (
//                     <p className="text-xs text-destructive pt-1">{getFieldError("acquisition_date")}</p>
//                   )}
//                 </div>
//               </div>
//               <p className="text-xs text-muted-foreground mt-2">Providing these helps in more accurate service tracking from the start.</p>
//             </div>
//           </CardContent>
//           <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50 mt-4">
//             <Button
//               type="button"
//               variant="outline"
//               onClick={() => navigate(`/vehicles/${vehicleId}/maintenance`)}
//               disabled={updateVehicleMutation.isPending} // Use mutation's loading state
//             >
//               <XCircle className="mr-2 h-4 w-4" /> Cancel
//             </Button>
//             <Button type="submit" disabled={updateVehicleMutation.isPending}>
//               {updateVehicleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
//               Save Changes
//             </Button>
//           </CardFooter>
//         </form>
//       </Card>
//     </div>
//   );
// }

import { useParams, useNavigate, Link } from "react-router-dom";
import { useVehicle, useUpdateVehicle } from "../api";
import { VehicleUpdate } from "../types";
import { VehicleForm } from "@/components/VehicleForm"; // Import our new form
import { AxiosError } from "axios";

// UI Components
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Edit, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function EditVehiclePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  // Fetching data hook - this was already good!
  const { data: vehicle, isLoading, isError, error: queryError } = useVehicle(vehicleId);

  // Submission hook
  const { mutate: updateVehicle, isPending, error: mutationError } = useUpdateVehicle();

  const handleSubmit = (payload: VehicleUpdate) => {
    if (!vehicleId) return;

    // Optional: Check if changes were made to prevent redundant API calls
    const hasChanges = Object.keys(payload).some((key) => payload[key as keyof VehicleUpdate] !== vehicle?.[key as keyof typeof vehicle]);
    if (!hasChanges) {
      toast.info("No changes were made.");
      return;
    }

    updateVehicle(
      { id: Number(vehicleId), vehicleData: payload },
      {
        onSuccess: () => {
          navigate(`/vehicles/${vehicleId}/maintenance`);
        },
      }
    );
  };

  const getBackendErrors = () => {
    const axiosError = mutationError as AxiosError<{ detail: any }>;
    if (axiosError?.response?.status === 422 && axiosError.response.data.detail) {
      return axiosError.response.data.detail.reduce((acc: Record<string, string[]>, err: any) => {
        const fieldKey = err.loc[1] || "general";
        acc[fieldKey] = acc[fieldKey] ? [...acc[fieldKey], err.msg] : [err.msg];
        return acc;
      }, {});
    }
    return {};
  };

  if (isLoading) {
    // Skeleton loader from your original component was great, let's keep a simplified version
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Vehicle</AlertTitle>
          <AlertDescription>{(queryError as any)?.response?.data?.detail || queryError.message}</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/vehicles")} variant="outline" className="mt-4 w-full">
          Back to Vehicles List
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/vehicles">Vehicles</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/vehicles/${vehicleId}/maintenance`}>{vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Vehicle</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="pb-0">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <Edit className="h-7 w-7 text-primary" />
            <CardTitle className="text-2xl">Edit Vehicle</CardTitle>
          </div>
          <CardDescription>
            Update details for {vehicle?.make} {vehicle?.model}
          </CardDescription>
        </CardHeader>
        <VehicleForm
          initialData={vehicle}
          onSubmit={handleSubmit}
          isSubmitting={isPending}
          backendErrors={getBackendErrors()}
          mode="edit"
        />
      </Card>
    </div>
  );
}
